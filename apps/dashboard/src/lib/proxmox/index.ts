/**
 * Proxmox VE API Client
 * Main entry point - exports all modules and factory functions
 */

import "server-only";
// Type-only import from generated Prisma client - does not violate db.ts import rule
// as this is erased at runtime and only used for type checking
import type { ProxmoxNode } from "@/generated/prisma/client";
import { decrypt } from "../encryption";
import { ProxmoxClient } from "./client";
import type {
  ProxmoxApiTokenCredentials,
  ProxmoxClientConfig,
  ProxmoxTicketCredentials,
} from "./types";

// ============================================================================
// Re-export all types and schemas
// ============================================================================

export * from "./types";
export * from "./schemas";
export * from "./errors";

// ============================================================================
// Re-export all modules
// ============================================================================

export { ProxmoxClient } from "./client";
export * as auth from "./auth";
export * as nodes from "./nodes";
export * as containers from "./containers";
export * as tasks from "./tasks";
export * as storage from "./storage";
export * as templates from "./templates";

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
 * Create a Proxmox client from session ticket credentials.
 * Uses PVE_HOST/PVE_PORT from env vars + the ticket/CSRF from the user's session.
 * This allows Proxmox API calls without a stored API token in the DB.
 */
export function createProxmoxClientFromTicket(
  ticket: string,
  csrfToken: string,
  username: string,
  expiresAt: Date,
  verifySsl = false,
): ProxmoxClient {
  const host = process.env.PVE_HOST;
  if (!host) {
    throw new Error("PVE_HOST environment variable is not set");
  }

  const port = process.env.PVE_PORT ? parseInt(process.env.PVE_PORT, 10) : 8006;

  const credentials: ProxmoxTicketCredentials = {
    type: "ticket",
    ticket,
    csrfToken,
    username,
    expiresAt,
  };

  return new ProxmoxClient({ host, port, credentials, verifySsl });
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
