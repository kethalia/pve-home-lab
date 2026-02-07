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
import { createProxmoxClientFromNode } from "@/lib/proxmox";
import { storage } from "@/lib/proxmox";
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

  // Get first configured Proxmox node
  const nodes = await DatabaseService.listNodes();

  if (nodes.length === 0) {
    return {
      templates: templates.map(mapTemplate),
      storages: [],
      bridges: [],
      nextVmid: 100,
      noNodeConfigured: true,
    };
  }

  const node = nodes[0];

  try {
    const client = createProxmoxClientFromNode(node);

    // Fetch storages, bridges, and next VMID in parallel
    const [storageList, networkList, nextVmidResponse] = await Promise.all([
      storage.listStorage(client, node.name),
      client.get(
        `/nodes/${node.name}/network`,
        z.array(
          z
            .object({
              iface: z.string(),
              type: z.string(),
            })
            .passthrough(),
        ),
      ),
      client.get("/cluster/nextid", z.number()),
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
    // Get first available node
    const nodes = await DatabaseService.listNodes();
    if (nodes.length === 0) {
      throw new Error(
        "No Proxmox nodes configured. Please add a node in Settings first.",
      );
    }
    const node = nodes[0];

    // Encrypt password for DB storage
    const encryptedPassword = encrypt(data.rootPassword);

    // Create container record
    const container = await DatabaseService.createContainer({
      vmid: data.vmid,
      rootPassword: encryptedPassword,
      nodeId: node.id,
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

    // Enqueue creation job
    const queue = getContainerCreationQueue();
    await queue.add("create-container", {
      containerId: container.id,
      nodeId: node.id,
      templateId: data.templateId || "",
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
    });

    revalidatePath("/containers");

    return { containerId: container.id };
  });
