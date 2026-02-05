/**
 * Proxmox VE OS template operations
 */

import "server-only";
import { z } from "zod";
import type { ProxmoxClient } from "./client.js";
import { TemplateSchema } from "./schemas.js";
import type { ProxmoxTemplate } from "./types.js";

/**
 * List available OS templates (aplinfo)
 */
export async function listTemplates(
  client: ProxmoxClient,
  node: string,
): Promise<ProxmoxTemplate[]> {
  return client.get(`/nodes/${node}/aplinfo`, z.array(TemplateSchema));
}
