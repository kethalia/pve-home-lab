/**
 * Proxmox VE API TypeScript definitions
 * Response types are inferred from Zod schemas for runtime validation
 */

import type { z } from "zod";
import type {
  TicketResponseSchema,
  ClusterNodeSchema,
  NodeStatusSchema,
  ContainerSchema,
  ContainerConfigSchema,
  ContainerStatusSchema,
  TaskStatusSchema,
  TaskLogEntrySchema,
  StorageSchema,
  StorageContentSchema,
  TemplateSchema,
} from "./schemas";

// ============================================================================
// Generic API Response
// ============================================================================

export interface ProxmoxApiResponse<T> {
  data: T;
}

// ============================================================================
// Authentication (Response types inferred from Zod schemas)
// ============================================================================

export type ProxmoxTicketResponse = z.infer<typeof TicketResponseSchema>;

export interface ProxmoxTicketCredentials {
  type: "ticket";
  ticket: string;
  csrfToken: string;
  username: string; // Stored for ticket refresh
  expiresAt: Date; // Tickets expire after 2 hours
}

export interface ProxmoxApiTokenCredentials {
  type: "token";
  tokenId: string; // Format: user@realm!tokenname
  tokenSecret: string;
}

export type ProxmoxCredentials =
  | ProxmoxTicketCredentials
  | ProxmoxApiTokenCredentials;

// ============================================================================
// Client Configuration
// ============================================================================

export interface ProxmoxClientConfig {
  host: string;
  port?: number; // Default: 8006
  credentials: ProxmoxCredentials;
  verifySsl?: boolean; // Default: false (for self-signed certs)
  retryConfig?: {
    maxRetries?: number; // Default: 3
    initialDelayMs?: number; // Default: 1000
    maxDelayMs?: number; // Default: 10000
  };
}

// ============================================================================
// Node (Response types inferred from Zod schemas)
// ============================================================================

export type ProxmoxClusterNode = z.infer<typeof ClusterNodeSchema>;
export type ProxmoxNodeStatus = z.infer<typeof NodeStatusSchema>;

// ============================================================================
// Container (LXC)
// ============================================================================

export type ProxmoxContainer = z.infer<typeof ContainerSchema>;
export type ProxmoxContainerConfig = z.infer<typeof ContainerConfigSchema>;
export type ProxmoxContainerStatus = z.infer<typeof ContainerStatusSchema>;

export interface ProxmoxContainerCreateConfig {
  vmid?: number; // Auto-assigned if not provided
  ostemplate: string; // e.g., "local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst"
  hostname?: string;
  description?: string;
  memory?: number; // MB, default 512
  swap?: number; // MB, default 512
  cores?: number; // Default 1
  cpulimit?: number;
  cpuunits?: number;
  rootfs?: string; // e.g., "local-lvm:8" for 8GB
  net0?: string; // e.g., "name=eth0,bridge=vmbr0,ip=dhcp"
  nameserver?: string;
  searchdomain?: string;
  password?: string; // Root password
  "ssh-public-keys"?: string;
  unprivileged?: boolean; // Default true
  features?: string; // e.g., "nesting=1,keyctl=1"
  onboot?: boolean;
  startup?: string;
  storage?: string; // Default storage for rootfs
  pool?: string;
  tags?: string;
  start?: boolean; // Start after creation
}

// ============================================================================
// Task (Response types inferred from Zod schemas)
// ============================================================================

export type ProxmoxTaskStatus = z.infer<typeof TaskStatusSchema>;
export type ProxmoxTaskLogEntry = z.infer<typeof TaskLogEntrySchema>;

export interface ProxmoxTaskWaitOptions {
  interval?: number; // Poll interval in ms, default 2000
  timeout?: number; // Timeout in ms, default 300000 (5 min)
  onProgress?: (log: ProxmoxTaskLogEntry[]) => void;
  signal?: AbortSignal; // Optional AbortSignal to cancel polling
}

// ============================================================================
// Storage (Response type inferred from Zod schema)
// ============================================================================

export type ProxmoxStorage = z.infer<typeof StorageSchema>;

export type ProxmoxStorageContent = z.infer<typeof StorageContentSchema>;

// ============================================================================
// Template (Response type inferred from Zod schema)
// ============================================================================

export type ProxmoxTemplate = z.infer<typeof TemplateSchema>;
