"use server";

/**
 * Container Creation Server Actions
 *
 * Server actions for creating containers and fetching wizard initialization data.
 * Uses authActionClient for authenticated access and next-safe-action patterns.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { authActionClient } from "@/lib/safe-action";
import { DatabaseService, prisma } from "@/lib/db";
import { encrypt } from "@/lib/encryption";
import { getContainerCreationQueue } from "@/lib/queue/container-creation";
import {
  createProxmoxClientFromNode,
  createProxmoxClientFromTicket,
  storage,
  nodes as proxmoxNodes,
} from "@/lib/proxmox";
import { getSessionData } from "@/lib/session";
import { createContainerInputSchema } from "./schemas";

// ============================================================================
// Types for wizard data
// ============================================================================

export interface WizardTemplate {
  id: string;
  name: string;
  description: string | null;
  osTemplate: string | null;
  cores: number | null;
  memory: number | null;
  swap: number | null;
  diskSize: number | null;
  storage: string | null;
  bridge: string | null;
  unprivileged: boolean;
  nesting: boolean;
  tags: string | null;
  packages: Array<{ id: string; name: string; manager: string }>;
  scripts: Array<{
    id: string;
    name: string;
    order: number;
    enabled: boolean;
    description: string | null;
  }>;
}

export interface WizardStorage {
  storage: string;
  type: string;
  content?: string;
}

export interface WizardBridge {
  iface: string;
  type: string;
}

export interface WizardData {
  templates: WizardTemplate[];
  storages: WizardStorage[];
  bridges: WizardBridge[];
  nextVmid: number;
  noNodeConfigured: boolean;
}

// ============================================================================
// Proxmox Node Helpers (session-based fallback)
// ============================================================================

/**
 * Get or create a ProxmoxNode DB record for the env-configured PVE host.
 * When no nodes exist in the DB, auto-creates one using PVE_HOST/PVE_PORT
 * from env vars. The tokenId/tokenSecret are set to placeholders since
 * we use ticket auth from the session instead.
 *
 * Returns the node and the Proxmox node name (for API paths).
 */
async function getOrCreateSessionNode(sessionData: {
  ticket: string;
  csrfToken: string;
  username: string;
  expiresAt: string;
}): Promise<{ nodeId: string; nodeName: string }> {
  // Check if any nodes exist in DB
  const existingNodes = await DatabaseService.listNodes();
  if (existingNodes.length > 0) {
    return { nodeId: existingNodes[0].id, nodeName: existingNodes[0].name };
  }

  // No DB nodes — auto-create from env vars
  const host = process.env.PVE_HOST;
  if (!host) {
    throw new Error(
      "No Proxmox nodes configured and PVE_HOST env var is not set.",
    );
  }
  const port = process.env.PVE_PORT ? parseInt(process.env.PVE_PORT, 10) : 8006;

  // Discover the node name from Proxmox API using session ticket
  const client = createProxmoxClientFromTicket(
    sessionData.ticket,
    sessionData.csrfToken,
    sessionData.username,
    new Date(sessionData.expiresAt),
  );

  const clusterNodes = await proxmoxNodes.listNodes(client);
  const nodeName = clusterNodes[0]?.node || "pve";

  // Create a DB record with placeholder token fields (ticket auth used instead)
  const placeholderToken = encrypt("session-auth-no-token");
  const node = await DatabaseService.createNode({
    name: nodeName,
    host,
    port,
    tokenId: `${sessionData.username}!session`,
    tokenSecret: placeholderToken,
  });

  return { nodeId: node.id, nodeName: node.name };
}

/**
 * Get a Proxmox client, preferring DB node (API token) but falling back
 * to session ticket auth when the DB node has placeholder credentials.
 */
async function getProxmoxClientWithFallback(
  nodeName: string,
  sessionData: {
    ticket: string;
    csrfToken: string;
    username: string;
    expiresAt: string;
  },
) {
  // Try DB node first
  const nodes = await DatabaseService.listNodes();
  const node = nodes[0];

  // If node has a real API token (not our placeholder), use it
  if (node && !node.tokenId.endsWith("!session")) {
    return {
      client: createProxmoxClientFromNode(node),
      nodeName: node.name,
    };
  }

  // Fall back to session ticket auth
  return {
    client: createProxmoxClientFromTicket(
      sessionData.ticket,
      sessionData.csrfToken,
      sessionData.username,
      new Date(sessionData.expiresAt),
    ),
    nodeName,
  };
}

// ============================================================================
// Fetch wizard initialization data
// ============================================================================

/**
 * Fetches all data needed to initialize the container creation wizard:
 * - Templates from DB (with packages and scripts)
 * - Available storages from Proxmox
 * - Available network bridges from Proxmox
 * - Next available VMID from Proxmox
 */
export async function getWizardData(): Promise<WizardData> {
  // Fetch templates from database
  const templates = await prisma.template.findMany({
    include: {
      packages: true,
      scripts: { orderBy: { order: "asc" } },
    },
    orderBy: { name: "asc" },
  });

  // Try to get a Proxmox client — either from DB node or session credentials
  const sessionData = await getSessionData();

  // Get first configured Proxmox node
  const nodes = await DatabaseService.listNodes();
  const node = nodes[0];

  // Determine if we can connect to Proxmox at all
  const hasDbNode = !!node;
  const hasSessionCreds = !!sessionData;
  const hasEnvHost = !!process.env.PVE_HOST;

  if (!hasDbNode && (!hasSessionCreds || !hasEnvHost)) {
    return {
      templates: templates.map(mapTemplate),
      storages: [],
      bridges: [],
      nextVmid: 100,
      noNodeConfigured: true,
    };
  }

  try {
    // Build a Proxmox client: prefer DB node with real API token, fall back to session
    let client;
    let nodeName: string;

    if (hasDbNode && !node.tokenId.endsWith("!session")) {
      // DB node with real API token
      client = createProxmoxClientFromNode(node);
      nodeName = node.name;
    } else if (hasSessionCreds && hasEnvHost) {
      // Session ticket auth fallback
      client = createProxmoxClientFromTicket(
        sessionData.ticket,
        sessionData.csrfToken,
        sessionData.username,
        new Date(sessionData.expiresAt),
      );
      // Discover node name from Proxmox API
      const clusterNodes = await proxmoxNodes.listNodes(client);
      nodeName = clusterNodes[0]?.node || node?.name || "pve";
    } else {
      // DB node exists but has placeholder token and no session — can't connect
      return {
        templates: templates.map(mapTemplate),
        storages: [],
        bridges: [],
        nextVmid: 100,
        noNodeConfigured: false,
      };
    }

    // Fetch storages, bridges, and next VMID in parallel
    const [storageList, networkList, nextVmidResponse] = await Promise.all([
      storage.listStorage(client, nodeName),
      client.get(
        `/nodes/${nodeName}/network`,
        z.array(
          z
            .object({
              iface: z.string(),
              type: z.string(),
            })
            .passthrough(),
        ),
      ),
      client.get("/cluster/nextid", z.coerce.number()),
    ]);

    // Filter storages that support container rootdir/images content
    const containerStorages = storageList.filter(
      (s) => s.content?.includes("rootdir") || s.content?.includes("images"),
    );

    // Filter for bridge interfaces only
    const bridges = networkList.filter((n) => n.type === "bridge");

    return {
      templates: templates.map(mapTemplate),
      storages: containerStorages.map((s) => ({
        storage: s.storage,
        type: s.type,
        content: s.content,
      })),
      bridges: bridges.map((b) => ({
        iface: b.iface,
        type: b.type,
      })),
      nextVmid: nextVmidResponse,
      noNodeConfigured: false,
    };
  } catch (error) {
    console.error("Failed to fetch Proxmox data for wizard:", error);
    // Return templates but empty Proxmox data — user can still fill in manually
    return {
      templates: templates.map(mapTemplate),
      storages: [],
      bridges: [],
      nextVmid: 100,
      noNodeConfigured: false,
    };
  }
}

/**
 * Map a Prisma template to the wizard-friendly shape.
 */
function mapTemplate(t: {
  id: string;
  name: string;
  description: string | null;
  osTemplate: string | null;
  cores: number | null;
  memory: number | null;
  swap: number | null;
  diskSize: number | null;
  storage: string | null;
  bridge: string | null;
  unprivileged: boolean;
  nesting: boolean;
  tags: string | null;
  packages: Array<{ id: string; name: string; manager: string }>;
  scripts: Array<{
    id: string;
    name: string;
    order: number;
    enabled: boolean;
    description: string | null;
  }>;
}): WizardTemplate {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    osTemplate: t.osTemplate,
    cores: t.cores,
    memory: t.memory,
    swap: t.swap,
    diskSize: t.diskSize,
    storage: t.storage,
    bridge: t.bridge,
    unprivileged: t.unprivileged,
    nesting: t.nesting,
    tags: t.tags,
    packages: t.packages.map((p) => ({
      id: p.id,
      name: p.name,
      manager: p.manager,
    })),
    scripts: t.scripts.map((s) => ({
      id: s.id,
      name: s.name,
      order: s.order,
      enabled: s.enabled,
      description: s.description,
    })),
  };
}

// ============================================================================
// Create container action
// ============================================================================

/**
 * Create a new container record and enqueue a BullMQ job for provisioning.
 *
 * 1. Validates input via Zod
 * 2. Finds first Proxmox node
 * 3. Encrypts root password for DB storage
 * 4. Creates Container record
 * 5. Resolves OS template path
 * 6. Enqueues BullMQ job with plaintext password (Proxmox API needs it)
 * 7. Returns container ID for redirect
 */
export const createContainerAction = authActionClient
  .schema(createContainerInputSchema)
  .action(async ({ parsedInput: data }) => {
    // Get session for Proxmox credentials
    const sessionData = await getSessionData();
    if (!sessionData) {
      throw new Error("Session expired. Please log in again.");
    }

    // Get or create a Proxmox node (auto-creates from env if no DB nodes exist)
    const { nodeId, nodeName } = await getOrCreateSessionNode(sessionData);

    // Encrypt password for DB storage
    const encryptedPassword = encrypt(data.rootPassword);

    // Create container record
    const container = await DatabaseService.createContainer({
      vmid: data.vmid,
      rootPassword: encryptedPassword,
      nodeId,
      templateId: data.templateId || undefined,
    });

    // Resolve OS template path
    let ostemplate = data.ostemplate || "";
    if (!ostemplate && data.templateId) {
      // Look up the template's osTemplate field
      const template = await prisma.template.findUnique({
        where: { id: data.templateId },
        select: { osTemplate: true },
      });
      if (template?.osTemplate) {
        ostemplate = `local:vztmpl/${template.osTemplate}_amd64.tar.zst`;
      }
    }
    // Fallback default if still empty
    if (!ostemplate) {
      ostemplate = "local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst";
    }

    // Build Proxmox credentials for the worker (ticket auth fallback)
    const host = process.env.PVE_HOST;
    const port = process.env.PVE_PORT
      ? parseInt(process.env.PVE_PORT, 10)
      : 8006;

    // Enqueue creation job
    const queue = getContainerCreationQueue();
    await queue.add("create-container", {
      containerId: container.id,
      nodeId,
      nodeName,
      templateId: data.templateId || null,
      proxmoxCredentials: host
        ? {
            host,
            port,
            ticket: sessionData.ticket,
            csrfToken: sessionData.csrfToken,
            username: sessionData.username,
            expiresAt: sessionData.expiresAt,
          }
        : undefined,
      config: {
        hostname: data.hostname,
        vmid: data.vmid,
        memory: data.memory,
        swap: data.swap,
        cores: data.cores,
        diskSize: data.diskSize,
        storage: data.storage,
        bridge: data.bridge,
        ipConfig: data.ipConfig,
        nameserver: data.nameserver,
        rootPassword: data.rootPassword, // Plaintext — Proxmox API needs it
        sshPublicKey: data.sshPublicKey,
        unprivileged: data.unprivileged,
        nesting: data.nesting,
        ostemplate,
        tags: data.tags,
      },
      enabledBuckets: data.enabledBuckets,
      additionalPackages: data.additionalPackages,
      scripts: data.scripts,
    });

    revalidatePath("/containers");

    return { containerId: container.id };
  });
