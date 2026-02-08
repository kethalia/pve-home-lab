/**
 * Proxmox VE API Client
 * Main entry point - exports all modules and factory functions
 */

// Server-side module — do not import from client components
// Type-only import from generated Prisma client - does not violate db.ts import rule
// as this is erased at runtime and only used for type checking
import type { ProxmoxNode } from "@/generated/prisma/client";
import { decrypt } from "../encryption";
import { ProxmoxClient } from "./client";
import { login } from "./auth";
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
// Cached env-based client
// ============================================================================

/** Cached ticket from env-based authentication */
let cachedTicket: {
  credentials: ProxmoxTicketCredentials;
  host: string;
  port: number;
} | null = null;

/**
 * Get a Proxmox client authenticated via env vars (PVE_HOST, PVE_PORT, PVE_ROOT_PASSWORD).
 *
 * Auto-authenticates by calling POST /access/ticket with the root password.
 * Caches the ticket in memory and refreshes when expired (2h TTL).
 * This is the primary way to get a Proxmox client — no user session needed.
 */
export async function getProxmoxClient(): Promise<ProxmoxClient> {
  const host = process.env.PVE_HOST;
  const password = process.env.PVE_ROOT_PASSWORD;

  if (!host || !password) {
    throw new Error(
      "PVE_HOST and PVE_ROOT_PASSWORD environment variables are required.",
    );
  }

  const port = process.env.PVE_PORT ? parseInt(process.env.PVE_PORT, 10) : 8006;

  // Reuse cached ticket if still valid (with 5 min buffer)
  if (
    cachedTicket &&
    cachedTicket.host === host &&
    cachedTicket.port === port
  ) {
    const bufferMs = 5 * 60 * 1000;
    if (cachedTicket.credentials.expiresAt.getTime() - Date.now() > bufferMs) {
      return new ProxmoxClient({
        host,
        port,
        credentials: cachedTicket.credentials,
        verifySsl: false,
      });
    }
  }

  // Authenticate and cache
  const credentials = await login(host, port, "root", password, "pam");
  cachedTicket = { credentials, host, port };

  return new ProxmoxClient({
    host,
    port,
    credentials,
    verifySsl: false,
  });
}

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
 * @deprecated Use getProxmoxClient() instead. Will be removed when multi-user DB auth is added.
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
