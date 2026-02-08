/**
 * Container Creation Worker
 *
 * Standalone BullMQ worker process that executes the 5-phase container creation pipeline:
 * 1. Create LXC container via Proxmox API
 * 2. Start container via Proxmox API
 * 3. Deploy config-manager infrastructure + template files via SSH
 * 4. Run config-manager initial sync + execute template scripts via SSH
 * 5. Discover services/credentials + finalize
 *
 * Run via: pnpm dev:worker (tsx --watch)
 */

import { Worker, type Job } from "bullmq";
import Redis from "ioredis";
import {
  type ContainerJobData,
  type ContainerJobResult,
  type ContainerProgressEvent,
  getProgressChannel,
} from "../lib/queue/container-creation";
import {
  DatabaseService,
  ContainerLifecycle,
  EventType,
  ServiceType,
  ServiceStatus,
  prisma,
} from "../lib/db";
import { getProxmoxClient } from "../lib/proxmox";
import { createContainer, startContainer } from "../lib/proxmox/containers";
import { waitForTask } from "../lib/proxmox/tasks";
import { connectWithRetry, PctExecSession, type SSHSession } from "../lib/ssh";
import { encrypt } from "../lib/encryption";

// ============================================================================
// Redis Connections
// ============================================================================

// Worker connection MUST have maxRetriesPerRequest: null for BullMQ
const workerConnection = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
});

// Separate connection for Pub/Sub publishing
const publisher = new Redis(process.env.REDIS_URL!);

// ============================================================================
// Progress Helper
// ============================================================================

/**
 * Publish a progress event to Redis Pub/Sub and persist to DB.
 * Log events are only published to Redis (too many for DB).
 * Step, complete, and error events are persisted for late subscribers / audit.
 */
async function publishProgress(
  containerId: string,
  event: Omit<ContainerProgressEvent, "timestamp">,
): Promise<void> {
  const fullEvent: ContainerProgressEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };

  // Publish to Redis Pub/Sub for real-time SSE subscribers
  await publisher.publish(
    getProgressChannel(containerId),
    JSON.stringify(fullEvent),
  );

  // Only persist step, complete, and error events to DB (skip log events)
  if (event.type !== "log") {
    // Map progress event type + step to the appropriate DB EventType
    const stepToEventType: Record<string, EventType> = {
      creating: EventType.created,
      starting: EventType.started,
      deploying: EventType.service_ready,
      syncing: EventType.script_completed,
      finalizing: EventType.service_ready,
    };

    const dbEventType =
      event.type === "complete"
        ? EventType.created
        : event.type === "error"
          ? EventType.error
          : (event.step && stepToEventType[event.step]) ||
            EventType.script_completed;

    await DatabaseService.createContainerEvent({
      containerId,
      type: dbEventType,
      message: event.message,
      metadata: JSON.stringify({ step: event.step, percent: event.percent }),
    });
  }
}

// ============================================================================
// IP Extraction Helper
// ============================================================================

/**
 * Extract IP address from Proxmox ipConfig string.
 * Handles formats like "ip=10.0.0.50/24,gw=10.0.0.1"
 */
function extractIpFromConfig(ipConfig: string): string | null {
  // Handle "ip=10.0.0.50/24,gw=10.0.0.1"
  const match = ipConfig.match(/ip=(\d+\.\d+\.\d+\.\d+)/);
  return match ? match[1] : null;
}

// ============================================================================
// System services to exclude from discovery
// ============================================================================

const SYSTEM_SERVICES = new Set([
  "systemd-journald.service",
  "systemd-logind.service",
  "systemd-udevd.service",
  "systemd-networkd.service",
  "systemd-resolved.service",
  "systemd-timesyncd.service",
  "ssh.service",
  "sshd.service",
  "cron.service",
  "dbus.service",
  "getty@tty1.service",
  "serial-getty@ttyS0.service",
  "user@0.service",
]);

// ============================================================================
// 5-Phase Pipeline
// ============================================================================

async function processContainerCreation(
  job: Job<ContainerJobData, ContainerJobResult>,
): Promise<ContainerJobResult> {
  const {
    containerId,
    nodeName,
    templateId,
    config,
    enabledBuckets,
    additionalPackages,
    scripts: scriptSelections,
  } = job.data;
  let ssh: SSHSession | PctExecSession | null = null;

  try {
    // ========================================================================
    // Phase 1: Create Container (0-20%)
    // ========================================================================

    // Authenticate via env vars (PVE_HOST + PVE_ROOT_PASSWORD)
    const client = await getProxmoxClient();
    const pveNodeName = nodeName;

    await publishProgress(containerId, {
      type: "step",
      step: "creating",
      percent: 5,
      message: "Creating LXC container...",
    });

    // Build features string from config
    const features: string[] = [];
    if (config.nesting) features.push("nesting=1");
    const featuresStr = features.length > 0 ? features.join(",") : undefined;

    const createUpid = await createContainer(client, pveNodeName, {
      vmid: config.vmid,
      ostemplate: config.ostemplate,
      hostname: config.hostname,
      memory: config.memory,
      swap: config.swap,
      cores: config.cores,
      rootfs: `${config.storage}:${config.diskSize}`,
      net0: `name=eth0,bridge=${config.bridge},${config.ipConfig.startsWith("ip=") ? config.ipConfig : `ip=${config.ipConfig}`}`,
      nameserver: config.nameserver,
      password: config.rootPassword,
      "ssh-public-keys": config.sshPublicKey,
      unprivileged: config.unprivileged,
      features: featuresStr,
      storage: config.storage,
      tags: config.tags,
    });

    await waitForTask(client, pveNodeName, createUpid, {
      interval: 2000,
      timeout: 120_000,
    });

    await publishProgress(containerId, {
      type: "step",
      step: "creating",
      percent: 20,
      message: "Container created successfully",
    });

    // ========================================================================
    // Phase 2: Start Container (20-35%)
    // ========================================================================

    await publishProgress(containerId, {
      type: "step",
      step: "starting",
      percent: 25,
      message: "Starting container...",
    });

    const startUpid = await startContainer(client, pveNodeName, config.vmid);

    await waitForTask(client, pveNodeName, startUpid, {
      interval: 2000,
      timeout: 60_000,
    });

    await publishProgress(containerId, {
      type: "step",
      step: "starting",
      percent: 35,
      message: "Container started",
    });

    // ========================================================================
    // Phase 3: Deploy config-manager and template files via SSH (35-60%)
    // ========================================================================

    // Extract container IP for web URLs in service discovery
    const containerIp = extractIpFromConfig(config.ipConfig);

    await publishProgress(containerId, {
      type: "step",
      step: "deploying",
      percent: 40,
      message: "Connecting to Proxmox host...",
    });

    // Connect to the Proxmox host node and use pct exec/push to configure
    // the container. This avoids needing SSH inside the container.
    const pveHost = process.env.PVE_HOST;
    const pveRootPassword = process.env.PVE_ROOT_PASSWORD;

    if (!pveHost) {
      throw new Error("PVE_HOST env var is required for container setup.");
    }

    if (!pveRootPassword) {
      throw new Error(
        "PVE_ROOT_PASSWORD env var is required for container setup via pct exec. " +
          "Set it to the root password of your Proxmox host.",
      );
    }

    const hostSsh = await connectWithRetry({
      host: pveHost,
      username: "root",
      password: pveRootPassword,
    });
    ssh = new PctExecSession(hostSsh, config.vmid);

    await publishProgress(containerId, {
      type: "log",
      message: `Connected to ${pveHost}, using pct exec for CT ${config.vmid}`,
    });

    // Wait for container to be fully ready (systemd initialized)
    // pct push fails if /etc/systemd/system/ doesn't exist yet
    await publishProgress(containerId, {
      type: "log",
      message: "Waiting for container filesystem to be ready...",
    });

    for (let attempt = 1; attempt <= 15; attempt++) {
      const check = await ssh.exec(
        "test -d /etc/systemd/system && echo ready || echo not-ready",
      );
      if (check.stdout.trim() === "ready") break;
      if (attempt === 15) {
        throw new Error(
          "Container filesystem not ready after 15 attempts — /etc/systemd/system not found",
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    await publishProgress(containerId, {
      type: "log",
      message: "Container filesystem ready",
    });

    // Phase 3a: Deploy config-manager infrastructure
    await ssh.exec(
      "mkdir -p /etc/config-manager /etc/infrahaus/credentials /var/log/config-manager",
    );

    await publishProgress(containerId, {
      type: "log",
      message: "Created directory structure",
    });

    // Fetch template with scripts, files, packages from DB (if using a template)
    const template = templateId
      ? await prisma.template.findUnique({
          where: { id: templateId },
          include: {
            scripts: { where: { enabled: true }, orderBy: { order: "asc" } },
            files: true,
            packages: true,
          },
        })
      : null;

    if (templateId && !template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Write config.env
    const configEnvContent = [
      `CONFIG_REPO_URL=${process.env.CONFIG_REPO_URL || ""}`,
      `CONFIG_BRANCH=main`,
      `CONFIG_PATH=${template?.path || template?.name || "scratch"}`,
      `TEMPLATE_NAME=${template?.name || "scratch"}`,
      `CONTAINER_ID=${containerId}`,
    ].join("\n");

    await ssh.uploadFile(
      configEnvContent,
      "/etc/config-manager/config.env",
      0o644,
    );

    await publishProgress(containerId, {
      type: "log",
      message: "Deployed config.env",
    });

    // Deploy config-sync.sh
    const configSyncScript = `#!/bin/bash
# Config Manager Sync Script
# Pulls configuration from the configured repository and applies it

set -euo pipefail

LOG_DIR="/var/log/config-manager"
CONFIG_DIR="/etc/config-manager"

# Source environment
if [ -f "\${CONFIG_DIR}/config.env" ]; then
  source "\${CONFIG_DIR}/config.env"
fi

echo "[$(date -Iseconds)] Config sync started" >> "\${LOG_DIR}/sync.log"

# If CONFIG_REPO_URL is set, attempt git sync
if [ -n "\${CONFIG_REPO_URL:-}" ]; then
  SYNC_DIR="/opt/config-sync"
  mkdir -p "\${SYNC_DIR}"

  if [ -d "\${SYNC_DIR}/.git" ]; then
    cd "\${SYNC_DIR}"
    git pull origin "\${CONFIG_BRANCH:-main}" 2>&1 >> "\${LOG_DIR}/sync.log" || true
  else
    git clone -b "\${CONFIG_BRANCH:-main}" "\${CONFIG_REPO_URL}" "\${SYNC_DIR}" 2>&1 >> "\${LOG_DIR}/sync.log" || true
  fi

  # Apply config if path exists in repo
  if [ -d "\${SYNC_DIR}/\${CONFIG_PATH:-}" ]; then
    echo "[$(date -Iseconds)] Applying config from \${CONFIG_PATH}" >> "\${LOG_DIR}/sync.log"
    cp -r "\${SYNC_DIR}/\${CONFIG_PATH}/"* / 2>/dev/null || true
  fi
fi

echo "[$(date -Iseconds)] Config sync completed" >> "\${LOG_DIR}/sync.log"
`;

    await ssh.uploadFile(
      configSyncScript,
      "/usr/local/bin/config-sync.sh",
      0o755,
    );

    await publishProgress(containerId, {
      type: "log",
      message: "Deployed config-sync.sh",
    });

    // Deploy systemd service
    const systemdUnit = `[Unit]
Description=Config Manager Sync Service
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
EnvironmentFile=/etc/config-manager/config.env
ExecStart=/usr/local/bin/config-sync.sh
StandardOutput=append:/var/log/config-manager/sync.log
StandardError=append:/var/log/config-manager/sync.log

[Install]
WantedBy=multi-user.target
`;

    await ssh.uploadFile(
      systemdUnit,
      "/etc/systemd/system/config-manager.service",
      0o644,
    );

    // Enable the service
    await ssh.exec(
      "systemctl daemon-reload && systemctl enable config-manager.service",
    );

    await publishProgress(containerId, {
      type: "log",
      message: "Installed and enabled config-manager.service",
    });

    await publishProgress(containerId, {
      type: "step",
      step: "deploying",
      percent: 50,
      message: "Config-manager installed",
    });

    // Phase 3b: Deploy template files
    if (template && template.files.length > 0) {
      for (const file of template.files) {
        // Ensure target directory exists
        await ssh.exec(`mkdir -p "${file.targetPath}"`);
        await ssh.uploadFile(
          file.content,
          `${file.targetPath}/${file.name}`,
          0o644,
        );

        await publishProgress(containerId, {
          type: "log",
          message: `Deployed file: ${file.targetPath}/${file.name}`,
        });
      }
    }

    await publishProgress(containerId, {
      type: "step",
      step: "deploying",
      percent: 60,
      message: "Template files deployed",
    });

    // ========================================================================
    // Phase 4: Run config-manager and execute scripts (60-90%)
    // ========================================================================

    await publishProgress(containerId, {
      type: "step",
      step: "syncing",
      percent: 65,
      message: "Running config-manager initial sync...",
    });

    // Run config-manager service once (initial sync)
    // Use `;` instead of `&&` so journalctl runs regardless of sync outcome.
    // The exit code comes from journalctl (always 0) — check sync separately via systemctl.
    await ssh.execStreaming(
      "systemctl start config-manager.service 2>&1; journalctl -u config-manager.service --no-pager -n 50 2>/dev/null",
      (line) => {
        publishProgress(containerId, {
          type: "log",
          message: line,
        });
      },
    );

    // Check actual sync result
    const syncResult = await ssh.exec(
      "systemctl is-failed config-manager.service 2>/dev/null || true",
    );
    const syncFailed = syncResult.stdout.trim() === "failed";

    if (syncFailed) {
      await publishProgress(containerId, {
        type: "log",
        message:
          "Config-manager sync failed (non-fatal — scripts will still run)",
      });
    }

    // Install user-selected packages (from wizard enabledBuckets + additionalPackages)
    if ((enabledBuckets && enabledBuckets.length > 0) || additionalPackages) {
      await publishProgress(containerId, {
        type: "log",
        message: "Installing user-selected packages...",
      });

      // Collect packages from template by enabled bucket managers
      const templatePackages =
        template && enabledBuckets
          ? template.packages.filter((p) => enabledBuckets.includes(p.manager))
          : [];

      // Install apt packages
      const aptPackages = templatePackages
        .filter((p) => p.manager === "apt")
        .map((p) => p.name);

      // Append free-text additional packages (one per line, assumed apt)
      if (additionalPackages) {
        const extra = additionalPackages
          .split(/\n/)
          .map((p) => p.trim())
          .filter(Boolean);
        aptPackages.push(...extra);
      }

      if (aptPackages.length > 0) {
        const installCmd = `DEBIAN_FRONTEND=noninteractive apt-get update -qq && apt-get install -y -qq ${aptPackages.join(" ")}`;
        const installExit = await ssh.execStreaming(installCmd, (line) => {
          publishProgress(containerId, {
            type: "log",
            message: line,
          });
        });
        if (installExit !== 0) {
          await publishProgress(containerId, {
            type: "log",
            message: `Package installation exited with code ${installExit} (non-fatal)`,
          });
        }
      }

      // Install pip packages
      const pipPackages = templatePackages
        .filter((p) => p.manager === "pip")
        .map((p) => p.name);

      if (pipPackages.length > 0) {
        const pipCmd = `pip install --quiet ${pipPackages.join(" ")}`;
        const pipExit = await ssh.execStreaming(pipCmd, (line) => {
          publishProgress(containerId, { type: "log", message: line });
        });
        if (pipExit !== 0) {
          await publishProgress(containerId, {
            type: "log",
            message: `pip install exited with code ${pipExit} (non-fatal)`,
          });
        }
      }
    }

    // Filter template scripts by user's wizard selections (if provided)
    const enabledScripts = template
      ? scriptSelections
        ? template.scripts.filter((s) => {
            const selection = scriptSelections.find((sel) => sel.id === s.id);
            return selection ? selection.enabled : s.enabled;
          })
        : template.scripts
      : [];

    // Execute template scripts
    if (enabledScripts.length > 0) {
      const scriptCount = enabledScripts.length;
      const percentPerScript = 25 / scriptCount; // Distribute 65-90% across scripts

      for (let i = 0; i < enabledScripts.length; i++) {
        const script = enabledScripts[i];
        const scriptPercent = Math.round(65 + (i + 1) * percentPerScript);

        await publishProgress(containerId, {
          type: "log",
          message: `Running script: ${script.name} (${i + 1}/${scriptCount})`,
        });

        // Upload script to /tmp
        const scriptPath = `/tmp/${script.name}`;
        await ssh.uploadFile(script.content, scriptPath, 0o755);

        // Execute script with streaming output
        const exitCode = await ssh.execStreaming(
          `bash "${scriptPath}"`,
          (line) => {
            publishProgress(containerId, {
              type: "log",
              message: line,
            });
          },
        );

        if (exitCode !== 0) {
          throw new Error(
            `Script "${script.name}" failed with exit code ${exitCode}`,
          );
        }

        // Clean up script
        await ssh.exec(`rm -f "${scriptPath}"`);

        await publishProgress(containerId, {
          type: "step",
          step: "syncing",
          percent: scriptPercent,
          message: `Script "${script.name}" completed`,
        });
      }
    }

    await publishProgress(containerId, {
      type: "step",
      step: "syncing",
      percent: 90,
      message: "Setup scripts completed",
    });

    // ========================================================================
    // Phase 5: Service discovery and finalize (90-100%)
    // ========================================================================

    await publishProgress(containerId, {
      type: "step",
      step: "finalizing",
      percent: 92,
      message: "Discovering services...",
    });

    // Phase 5a: Service and credential discovery

    // Read credentials from /etc/infrahaus/credentials/
    const credResult = await ssh.exec(
      "ls /etc/infrahaus/credentials/ 2>/dev/null || echo 'empty'",
    );

    if (credResult.stdout.trim() !== "empty" && credResult.stdout.trim()) {
      const files = credResult.stdout
        .trim()
        .split("\n")
        .filter((f) => f.trim());
      for (const file of files) {
        try {
          const content = await ssh.exec(
            `cat "/etc/infrahaus/credentials/${file}"`,
          );
          if (content.stdout.trim()) {
            // Encrypt credentials before storing
            const encryptedCreds = encrypt(content.stdout.trim());
            const serviceName = file.replace(/\.(json|txt|conf)$/, "");

            await DatabaseService.createContainerService({
              containerId,
              name: serviceName,
              type: ServiceType.systemd,
              status: ServiceStatus.running,
              credentials: encryptedCreds,
            });

            await publishProgress(containerId, {
              type: "log",
              message: `Discovered credentials for: ${serviceName}`,
            });
          }
        } catch {
          // Non-fatal: skip unreadable credential files
          await publishProgress(containerId, {
            type: "log",
            message: `Warning: could not read credentials file: ${file}`,
          });
        }
      }
    }

    // Discover running services via systemd
    const servicesResult = await ssh.exec(
      "systemctl list-units --type=service --state=running --no-pager --no-legend 2>/dev/null | awk '{print $1}'",
    );

    // Discover listening ports
    const portsResult = await ssh.exec(
      "ss -tlnp 2>/dev/null | tail -n +2 | awk '{print $4, $6}'",
    );

    // Parse ports into a map: process name → port
    const portMap = new Map<string, number>();
    if (portsResult.stdout.trim()) {
      for (const line of portsResult.stdout.trim().split("\n")) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
          // Extract port from address (e.g., "0.0.0.0:80" or "*:443")
          const addrPart = parts[0];
          const portMatch = addrPart.match(/:(\d+)$/);
          // Extract process name from users: field
          const processMatch = parts[1]?.match(/\("([^"]+)"/);
          if (portMatch) {
            const port = parseInt(portMatch[1], 10);
            const processName = processMatch?.[1] || "unknown";
            portMap.set(processName, port);
          }
        }
      }
    }

    // Filter and create ContainerService records for application services
    if (servicesResult.stdout.trim()) {
      const services = servicesResult.stdout
        .trim()
        .split("\n")
        .filter((s) => s.trim() && !SYSTEM_SERVICES.has(s.trim()));

      for (const serviceName of services) {
        const cleanName = serviceName.trim().replace(/\.service$/, "");
        const port = portMap.get(cleanName) || undefined;

        await DatabaseService.createContainerService({
          containerId,
          name: cleanName,
          type: ServiceType.systemd,
          port,
          webUrl: port ? `http://${containerIp}:${port}` : undefined,
          status: ServiceStatus.running,
        });

        await publishProgress(containerId, {
          type: "log",
          message: `Discovered service: ${cleanName}${port ? ` (port ${port})` : ""}`,
        });
      }
    }

    // Phase 5b: Finalize
    await publishProgress(containerId, {
      type: "step",
      step: "finalizing",
      percent: 98,
      message: "Finalizing container...",
    });

    // Update container lifecycle to ready
    await DatabaseService.updateContainerLifecycle(
      containerId,
      ContainerLifecycle.ready,
    );

    // Close SSH session
    ssh.close();
    ssh = null;

    await publishProgress(containerId, {
      type: "complete",
      percent: 100,
      message: "Container ready!",
    });

    return { success: true, containerId, vmid: config.vmid };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error(
      `Container creation failed for ${containerId}:`,
      errorMessage,
    );

    // Update lifecycle to error
    try {
      await DatabaseService.updateContainerLifecycle(
        containerId,
        ContainerLifecycle.error,
      );
    } catch {
      console.error("Failed to update container lifecycle to error");
    }

    // Publish error event
    try {
      await publishProgress(containerId, {
        type: "error",
        message: errorMessage,
      });
    } catch {
      console.error("Failed to publish error progress event");
    }

    return {
      success: false,
      containerId,
      vmid: config.vmid,
      error: errorMessage,
    };
  } finally {
    // Always close SSH connection
    if (ssh) {
      try {
        ssh.close();
      } catch {
        // Ignore close errors
      }
    }
  }
}

// ============================================================================
// Worker Instantiation
// ============================================================================

const worker = new Worker<ContainerJobData, ContainerJobResult>(
  "container-creation",
  processContainerCreation,
  {
    connection: workerConnection,
    concurrency: 2, // Process up to 2 containers simultaneously
  },
);

worker.on("completed", (job, result) => {
  const config = job.data.config;
  if (result.success) {
    console.log("");
    console.log("========================================");
    console.log("  CONTAINER CREATED SUCCESSFULLY");
    console.log("========================================");
    console.log(`  Hostname:  ${config.hostname}`);
    console.log(`  VMID:      ${config.vmid}`);
    console.log(`  Node:      ${job.data.nodeName}`);
    console.log(`  IP:        ${config.ipConfig}`);
    console.log(`  Storage:   ${config.storage}`);
    console.log("========================================");
    console.log("");
  } else {
    console.error("");
    console.error("========================================");
    console.error("  CONTAINER CREATION FAILED");
    console.error("========================================");
    console.error(`  Hostname:  ${config.hostname}`);
    console.error(`  VMID:      ${config.vmid}`);
    console.error(`  Error:     ${result.error}`);
    console.error("========================================");
    console.error("");
  }
});

worker.on("failed", (job, err) => {
  console.error("");
  console.error("========================================");
  console.error("  JOB FAILED (unhandled)");
  console.error("========================================");
  console.error(`  Job ID:  ${job?.id}`);
  console.error(`  Error:   ${err.message}`);
  console.error("========================================");
  console.error("");
});

// ============================================================================
// Graceful Shutdown
// ============================================================================

async function shutdown() {
  console.log("Shutting down worker...");
  await worker.close();
  await publisher.quit();
  await workerConnection.quit();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// ============================================================================
// Startup
// ============================================================================

console.log("Container creation worker started. Waiting for jobs...");
