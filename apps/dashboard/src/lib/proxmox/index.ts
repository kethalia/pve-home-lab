/**
 * Proxmox VE API Client
 * Main entry point - exports all modules and factory functions
 */

import "server-only";
// Type-only import from generated Prisma client - does not violate db.ts import rule
// as this is erased at runtime and only used for type checking
import type { ProxmoxNode } from "@/generated/prisma/client/index.js";
import { decrypt } from "../encryption.js";
import { ProxmoxClient } from "./client.js";
import type {
  ProxmoxApiTokenCredentials,
  ProxmoxClientConfig,
} from "./types.js";

// ============================================================================
// Re-export all types and schemas
// ============================================================================

export * from "./types.js";
export * from "./schemas.js";
export * from "./errors.js";

// ============================================================================
// Re-export all modules
// ============================================================================

export { ProxmoxClient } from "./client.js";
export * as auth from "./auth.js";
export * as nodes from "./nodes.js";
export * as containers from "./containers.js";
export * as tasks from "./tasks.js";
export * as storage from "./storage.js";
export * as templates from "./templates.js";

// ============================================================================
// Factory functions
// ============================================================================

/**
 * Create a Proxmox client from configuration
 */
export function createProxmoxClient(
  config: ProxmoxClientConfig,
): ProxmoxClient {
  return new ProxmoxClient(config);
}

/**
 * Create a Proxmox client from a Prisma ProxmoxNode model
 * Automatically decrypts the stored tokenSecret
 *
 * @param node - ProxmoxNode from database
 * @param verifySsl - Whether to verify SSL certificates (default: false for self-signed certs)
 */
export function createProxmoxClientFromNode(
  node: ProxmoxNode,
  verifySsl = false,
): ProxmoxClient {
  // Decrypt the token secret
  const tokenSecret = decrypt(node.tokenSecret);

  // Create API token credentials
  const credentials: ProxmoxApiTokenCredentials = {
    type: "token",
    tokenId: node.tokenId,
    tokenSecret,
  };

  // Create client config
  const config: ProxmoxClientConfig = {
    host: node.host,
    port: node.port,
    credentials,
    verifySsl,
  };

  return new ProxmoxClient(config);
}
