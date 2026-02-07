// Server-side module — do not import from client components

import { Queue } from "bullmq";
import { getRedis } from "../redis";

// ============================================================================
// Types
// ============================================================================

/** Data passed to the container creation job */
export interface ContainerJobData {
  containerId: string; // Prisma Container ID (cuid)
  nodeId: string; // Prisma ProxmoxNode ID
  templateId: string; // Prisma Template ID (for fetching scripts/files/packages)
  config: {
    hostname: string;
    vmid: number;
    memory: number; // MB
    swap: number; // MB
    cores: number;
    diskSize: number; // GB
    storage: string; // e.g., "local-lvm"
    bridge: string; // e.g., "vmbr0"
    ipConfig: string; // e.g., "ip=dhcp" or "ip=10.0.0.50/24,gw=10.0.0.1"
    nameserver?: string;
    rootPassword: string; // Plaintext for Proxmox API (encrypted in DB, decrypted before enqueue)
    sshPublicKey?: string;
    unprivileged: boolean;
    nesting: boolean;
    ostemplate: string; // e.g., "local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst"
    tags?: string;
  };
}

/** Progress event published via Redis Pub/Sub */
export interface ContainerProgressEvent {
  type: "step" | "log" | "complete" | "error";
  step?: "creating" | "starting" | "deploying" | "syncing" | "finalizing";
  percent?: number; // 0-100
  message: string;
  timestamp: string; // ISO string
}

/** Result returned by the worker on job completion */
export interface ContainerJobResult {
  success: boolean;
  containerId: string;
  vmid: number;
  error?: string;
}

// ============================================================================
// Queue Instance (lazy-initialized)
// ============================================================================

let queue: Queue<ContainerJobData, ContainerJobResult> | null = null;

/**
 * Get the container creation queue instance.
 * Uses lazy initialization — the queue is only created when first accessed.
 */
export function getContainerCreationQueue(): Queue<
  ContainerJobData,
  ContainerJobResult
> {
  if (!queue) {
    queue = new Queue<ContainerJobData, ContainerJobResult>(
      "container-creation",
      {
        connection: getRedis(),
        defaultJobOptions: {
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 500 },
          attempts: 1, // No auto-retry — container creation is not idempotent
        },
      },
    );
  }
  return queue;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get the Redis Pub/Sub channel name for a container's progress events.
 * Used by both the worker (publish) and the SSE route (subscribe).
 */
export function getProgressChannel(containerId: string): string {
  return `container:${containerId}:progress`;
}
