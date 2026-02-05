/**
 * Proxmox VE LXC container operations
 */

import "server-only";
import { z } from "zod";
import type { ProxmoxClient } from "./client.js";
import {
  ContainerSchema,
  ContainerConfigSchema,
  ContainerStatusSchema,
} from "./schemas.js";
import type {
  ProxmoxContainer,
  ProxmoxContainerConfig,
  ProxmoxContainerCreateConfig,
  ProxmoxContainerStatus,
} from "./types.js";

/**
 * List all LXC containers on a node
 */
export async function listContainers(
  client: ProxmoxClient,
  node: string,
): Promise<ProxmoxContainer[]> {
  return client.get(`/nodes/${node}/lxc`, z.array(ContainerSchema));
}

/**
 * Create a new LXC container
 * Returns UPID for task tracking
 */
export async function createContainer(
  client: ProxmoxClient,
  node: string,
  config: ProxmoxContainerCreateConfig,
): Promise<string> {
  // Convert config to form data format that Proxmox expects
  const formData = new URLSearchParams();

  // Required parameter
  formData.append("ostemplate", config.ostemplate);

  // Optional parameters - only add if defined
  if (config.vmid !== undefined) formData.append("vmid", String(config.vmid));
  if (config.hostname) formData.append("hostname", config.hostname);
  if (config.description) formData.append("description", config.description);
  if (config.memory !== undefined)
    formData.append("memory", String(config.memory));
  if (config.swap !== undefined) formData.append("swap", String(config.swap));
  if (config.cores !== undefined)
    formData.append("cores", String(config.cores));
  if (config.cpulimit !== undefined)
    formData.append("cpulimit", String(config.cpulimit));
  if (config.cpuunits !== undefined)
    formData.append("cpuunits", String(config.cpuunits));
  if (config.rootfs) formData.append("rootfs", config.rootfs);
  if (config.net0) formData.append("net0", config.net0);
  if (config.nameserver) formData.append("nameserver", config.nameserver);
  if (config.searchdomain) formData.append("searchdomain", config.searchdomain);
  if (config.password) formData.append("password", config.password);
  if (config["ssh-public-keys"])
    formData.append("ssh-public-keys", config["ssh-public-keys"]);
  if (config.unprivileged !== undefined)
    formData.append("unprivileged", config.unprivileged ? "1" : "0");
  if (config.features) formData.append("features", config.features);
  if (config.onboot !== undefined)
    formData.append("onboot", config.onboot ? "1" : "0");
  if (config.startup) formData.append("startup", config.startup);
  if (config.storage) formData.append("storage", config.storage);
  if (config.pool) formData.append("pool", config.pool);
  if (config.tags) formData.append("tags", config.tags);
  if (config.start !== undefined)
    formData.append("start", config.start ? "1" : "0");

  return client.post(`/nodes/${node}/lxc`, formData, z.string());
}

/**
 * Get current status of a container
 */
export async function getContainer(
  client: ProxmoxClient,
  node: string,
  vmid: number,
): Promise<ProxmoxContainerStatus> {
  return client.get(
    `/nodes/${node}/lxc/${vmid}/status/current`,
    ContainerStatusSchema,
  );
}

/**
 * Get container configuration
 */
export async function getContainerConfig(
  client: ProxmoxClient,
  node: string,
  vmid: number,
): Promise<ProxmoxContainerConfig> {
  return client.get(`/nodes/${node}/lxc/${vmid}/config`, ContainerConfigSchema);
}

/**
 * Start a container
 * Returns UPID for task tracking
 */
export async function startContainer(
  client: ProxmoxClient,
  node: string,
  vmid: number,
): Promise<string> {
  return client.post(
    `/nodes/${node}/lxc/${vmid}/status/start`,
    undefined,
    z.string(),
  );
}

/**
 * Stop a container (forceful)
 * Returns UPID for task tracking
 */
export async function stopContainer(
  client: ProxmoxClient,
  node: string,
  vmid: number,
): Promise<string> {
  return client.post(
    `/nodes/${node}/lxc/${vmid}/status/stop`,
    undefined,
    z.string(),
  );
}

/**
 * Shutdown a container (graceful)
 * Returns UPID for task tracking
 */
export async function shutdownContainer(
  client: ProxmoxClient,
  node: string,
  vmid: number,
  timeout?: number,
): Promise<string> {
  const body = timeout
    ? new URLSearchParams({ timeout: String(timeout) })
    : undefined;
  return client.post(
    `/nodes/${node}/lxc/${vmid}/status/shutdown`,
    body,
    z.string(),
  );
}

/**
 * Delete a container
 * Returns UPID for task tracking
 */
export async function deleteContainer(
  client: ProxmoxClient,
  node: string,
  vmid: number,
  purge = false,
): Promise<string> {
  const path = `/nodes/${node}/lxc/${vmid}${purge ? "?purge=1" : ""}`;
  return client.delete(path, z.string());
}
