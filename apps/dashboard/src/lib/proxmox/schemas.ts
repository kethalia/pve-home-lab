/**
 * Zod schemas for Proxmox VE API responses
 * These provide runtime validation for data returned from the Proxmox API
 */

import { z } from "zod";

// ============================================================================
// Authentication
// ============================================================================

export const TicketResponseSchema = z.object({
  ticket: z.string(),
  CSRFPreventionToken: z.string(),
  username: z.string(),
  clustername: z.string().optional(),
});

// ============================================================================
// Node
// ============================================================================

export const ClusterNodeSchema = z.object({
  node: z.string(),
  status: z.enum(["online", "offline", "unknown"]),
  type: z.literal("node"),
  id: z.string(),
  maxcpu: z.number().optional(),
  maxmem: z.number().optional(),
  cpu: z.number().optional(),
  mem: z.number().optional(),
  disk: z.number().optional(),
  maxdisk: z.number().optional(),
  level: z.string().optional(),
  uptime: z.number().optional(),
});

export const NodeStatusSchema = z.object({
  uptime: z.number(),
  idle: z.number(),
  loadavg: z.array(z.number()),
  kversion: z.string(),
  cpuinfo: z.object({
    cpus: z.number(),
    model: z.string(),
    mhz: z.string(),
    hvm: z.string().optional(),
    sockets: z.number(),
    cores: z.number(),
  }),
  memory: z.object({
    total: z.number(),
    used: z.number(),
    free: z.number(),
  }),
  swap: z.object({
    total: z.number(),
    used: z.number(),
    free: z.number(),
  }),
  pveversion: z.string(),
  rootfs: z.object({
    total: z.number(),
    used: z.number(),
    avail: z.number(),
  }),
});

// ============================================================================
// Container (LXC)
// ============================================================================

export const ContainerSchema = z.object({
  vmid: z.number(),
  status: z.enum(["running", "stopped", "mounted", "paused"]),
  name: z.string().optional(),
  maxdisk: z.number().optional(),
  disk: z.number().optional(),
  maxmem: z.number().optional(),
  mem: z.number().optional(),
  maxswap: z.number().optional(),
  swap: z.number().optional(),
  uptime: z.number().optional(),
  cpus: z.number().optional(),
  cpu: z.number().optional(),
  type: z.literal("lxc"),
  netin: z.number().optional(),
  netout: z.number().optional(),
  diskread: z.number().optional(),
  diskwrite: z.number().optional(),
  template: z.boolean().optional(),
  lock: z.string().optional(),
  tags: z.string().optional(),
});

export const ContainerConfigSchema = z
  .object({
    arch: z.enum(["amd64", "i386", "arm64", "armhf"]).optional(),
    cmode: z.enum(["tty", "console", "shell"]).optional(),
    console: z.boolean().optional(),
    cores: z.number().optional(),
    cpulimit: z.number().optional(),
    cpuunits: z.number().optional(),
    description: z.string().optional(),
    features: z.string().optional(),
    hookscript: z.string().optional(),
    hostname: z.string().optional(),
    lock: z.string().optional(),
    memory: z.number().optional(),
    nameserver: z.string().optional(),
    onboot: z.boolean().optional(),
    ostype: z.string().optional(),
    protection: z.boolean().optional(),
    rootfs: z.string().optional(),
    searchdomain: z.string().optional(),
    startup: z.string().optional(),
    swap: z.number().optional(),
    tags: z.string().optional(),
    template: z.boolean().optional(),
    tty: z.number().optional(),
    unprivileged: z.boolean().optional(),
  })
  .passthrough(); // Allow dynamic keys like net0, mp0, unused0

export const ContainerStatusSchema = z.object({
  status: z.enum(["running", "stopped", "mounted", "paused"]),
  vmid: z.number(),
  name: z.string().optional(),
  cpus: z.number().optional(),
  cpu: z.number().optional(),
  maxmem: z.number().optional(),
  mem: z.number().optional(),
  maxswap: z.number().optional(),
  swap: z.number().optional(),
  maxdisk: z.number().optional(),
  disk: z.number().optional(),
  uptime: z.number().optional(),
  netin: z.number().optional(),
  netout: z.number().optional(),
  diskread: z.number().optional(),
  diskwrite: z.number().optional(),
  ha: z
    .object({
      managed: z.boolean(),
    })
    .optional(),
  tags: z.string().optional(),
  lock: z.string().optional(),
});

// ============================================================================
// Task
// ============================================================================

export const TaskSchema = z.object({
  upid: z.string(),
  node: z.string(),
  pid: z.number(),
  pstart: z.number(),
  starttime: z.number(),
  type: z.string(),
  id: z.string().optional(),
  user: z.string(),
  status: z.enum(["running", "stopped"]).optional(),
  exitstatus: z.string().optional(),
});

export const TaskStatusSchema = z.object({
  status: z.enum(["running", "stopped"]),
  exitstatus: z.string().optional(),
  upid: z.string(),
  node: z.string(),
  pid: z.number(),
  pstart: z.number(),
  starttime: z.number(),
  type: z.string(),
  id: z.string().optional(),
  user: z.string(),
});

export const TaskLogEntrySchema = z.object({
  n: z.number(),
  t: z.string(),
});

// ============================================================================
// Storage
// ============================================================================

// Proxmox returns booleans as 0/1 integers — coerce to proper booleans
const pveBoolean = z.union([z.boolean(), z.number()]).transform((v) => !!v);

export const StorageSchema = z.object({
  storage: z.string(),
  type: z.string(),
  content: z.string().optional(),
  shared: pveBoolean.optional(),
  active: pveBoolean.optional(),
  enabled: pveBoolean.optional(),
  total: z.number().optional(),
  used: z.number().optional(),
  avail: z.number().optional(),
});

// ============================================================================
// Template (aplinfo)
// ============================================================================

export const StorageContentSchema = z
  .object({
    volid: z.string(), // e.g. "local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst"
    format: z.string(), // e.g. "tar.zst", "tar.gz"
    size: z.number(), // bytes
    content: z.string(), // "vztmpl"
  })
  .passthrough();

export const TemplateSchema = z.object({
  package: z.string(),
  template: z.string(),
  headline: z.string().optional(),
  description: z.string().optional(),
  os: z.string(),
  version: z.string(),
  architecture: z.string(),
  infopage: z.string().optional(),
  section: z.string().optional(),
  type: z.enum(["lxc", "openvz"]),
});
