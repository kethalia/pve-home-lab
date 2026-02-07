/**
 * Proxmox VE storage operations
 */

// Server-side module — do not import from client components
import { z } from "zod";
import type { ProxmoxClient } from "./client";
import { StorageSchema } from "./schemas";
import type { ProxmoxStorage } from "./types";

/**
 * List all storage on a node
 */
export async function listStorage(
  client: ProxmoxClient,
  node: string,
): Promise<ProxmoxStorage[]> {
  return client.get(`/nodes/${node}/storage`, z.array(StorageSchema));
}
