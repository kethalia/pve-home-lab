/**
 * Proxmox VE storage operations
 */

import "server-only";
import { z } from "zod";
import type { ProxmoxClient } from "./client.js";
import { StorageSchema } from "./schemas.js";
import type { ProxmoxStorage } from "./types.js";

/**
 * List all storage on a node
 */
export async function listStorage(
  client: ProxmoxClient,
  node: string,
): Promise<ProxmoxStorage[]> {
  return client.get(`/nodes/${node}/storage`, z.array(StorageSchema));
}
