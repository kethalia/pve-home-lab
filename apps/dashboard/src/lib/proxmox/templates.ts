/**
 * Proxmox VE OS template operations
 */

// Server-side module — do not import from client components
import { z } from "zod";
import type { ProxmoxClient } from "./client";
import { TemplateSchema, StorageContentSchema } from "./schemas";
import type { ProxmoxTemplate, ProxmoxStorageContent } from "./types";

/**
 * List available OS templates (aplinfo)
 */
export async function listTemplates(
  client: ProxmoxClient,
  node: string,
): Promise<ProxmoxTemplate[]> {
  return client.get(`/nodes/${node}/aplinfo`, z.array(TemplateSchema));
}

/**
 * List downloaded OS templates from storage
 */
export async function listDownloadedTemplates(
  client: ProxmoxClient,
  node: string,
  storage: string,
): Promise<ProxmoxStorageContent[]> {
  return client.get(
    `/nodes/${node}/storage/${storage}/content?content=vztmpl`,
    z.array(StorageContentSchema),
  );
}
