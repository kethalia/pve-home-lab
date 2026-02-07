/**
 * Proxmox VE node operations
 */

// Server-side module — do not import from client components
import { z } from "zod";
import type { ProxmoxClient } from "./client";
import { ClusterNodeSchema, NodeStatusSchema } from "./schemas";
import type { ProxmoxClusterNode, ProxmoxNodeStatus } from "./types";

/**
 * List all nodes in the cluster
 */
export async function listNodes(
  client: ProxmoxClient,
): Promise<ProxmoxClusterNode[]> {
  return client.get("/nodes", z.array(ClusterNodeSchema));
}

/**
 * Get status of a specific node
 */
export async function getNodeStatus(
  client: ProxmoxClient,
  node: string,
): Promise<ProxmoxNodeStatus> {
  return client.get(`/nodes/${node}/status`, NodeStatusSchema);
}
