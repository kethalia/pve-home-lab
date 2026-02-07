/**
 * Proxmox VE OS template operations
 */

// Server-side module — do not import from client components
import { z } from "zod";
import type { ProxmoxClient } from "./client";
import { TemplateSchema } from "./schemas";
import type { ProxmoxTemplate } from "./types";

/**
 * List available OS templates (aplinfo)
 */
export async function listTemplates(
  client: ProxmoxClient,
  node: string,
): Promise<ProxmoxTemplate[]> {
  return client.get(`/nodes/${node}/aplinfo`, z.array(TemplateSchema));
}
