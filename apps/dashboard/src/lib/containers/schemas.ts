/**
 * Shared Zod schemas for the container creation wizard.
 * Used by both server actions (validation) and client forms (react-hook-form).
 */

import { z } from "zod";

// ============================================================================
// Step 1: Template Selection
// ============================================================================

export const templateSelectionSchema = z.object({
  templateId: z.string().nullable(), // null = "start from scratch"
  templateName: z.string().nullable(),
});

// ============================================================================
// Step 2: Container Configuration
// ============================================================================

export const containerConfigSchema = z
  .object({
    hostname: z
      .string()
      .min(1, "Hostname is required")
      .max(63, "Hostname must be 63 characters or less")
      .regex(
        /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/,
        "Invalid hostname format — must start/end with alphanumeric, hyphens allowed in between",
      ),
    vmid: z.coerce
      .number()
      .int()
      .min(100, "VMID must be ≥ 100")
      .max(999999999, "VMID must be ≤ 999999999"),
    rootPassword: z.string().min(5, "Password must be at least 5 characters"),
    confirmPassword: z.string(),
    cores: z.coerce.number().int().min(1, "Minimum 1 core").max(128).default(1),
    memory: z.coerce
      .number()
      .int()
      .min(128, "Minimum 128 MB")
      .max(65536, "Maximum 65536 MB")
      .default(512),
    swap: z.coerce
      .number()
      .int()
      .min(0, "Swap cannot be negative")
      .max(65536, "Maximum 65536 MB")
      .default(512),
    diskSize: z.coerce
      .number()
      .int()
      .min(1, "Minimum 1 GB")
      .max(10240, "Maximum 10240 GB")
      .default(8),
    storage: z.string().min(1, "Storage is required"),
    bridge: z.string().min(1, "Network bridge is required"),
    ipConfig: z.string().default("ip=dhcp"),
    nameserver: z.string().optional(),
    unprivileged: z.boolean().default(true),
    nesting: z.boolean().default(false),
    sshPublicKey: z.string().optional(),
    tags: z.string().optional(),
    ostemplate: z.string().optional(),
  })
  .refine((data) => data.rootPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

// ============================================================================
// Step 3: Package Selection
// ============================================================================

export const packageSelectionSchema = z.object({
  enabledBuckets: z.array(z.string()), // bucket IDs that are enabled
  additionalPackages: z.string().optional(), // free-text additional packages
});

// ============================================================================
// Step 4: Script Configuration
// ============================================================================

export const scriptConfigSchema = z.object({
  scripts: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      enabled: z.boolean(),
      order: z.number(),
      description: z.string().nullable().optional(),
    }),
  ),
});

// ============================================================================
// Combined Wizard State
// ============================================================================

export const wizardStateSchema = z.object({
  step: z.number().min(1).max(5),
  template: templateSelectionSchema.nullable(),
  config: containerConfigSchema.nullable(),
  packages: packageSelectionSchema.nullable(),
  scripts: scriptConfigSchema.nullable(),
});

// ============================================================================
// Schema for the server action input
// ============================================================================

export const createContainerInputSchema = z.object({
  templateId: z.string().nullable(),
  hostname: z.string().min(1),
  vmid: z.coerce.number().int().min(100),
  rootPassword: z.string().min(5),
  cores: z.coerce.number().int().min(1).default(1),
  memory: z.coerce.number().int().min(128).default(512),
  swap: z.coerce.number().int().min(0).default(512),
  diskSize: z.coerce.number().int().min(1).default(8),
  storage: z.string().min(1),
  bridge: z.string().min(1),
  ipConfig: z.string().default("ip=dhcp"),
  nameserver: z.string().optional(),
  unprivileged: z.boolean().default(true),
  nesting: z.boolean().default(false),
  sshPublicKey: z.string().optional(),
  tags: z.string().optional(),
  ostemplate: z.string().optional(),
  enabledBuckets: z.array(z.string()).optional(),
  additionalPackages: z.string().optional(),
  scripts: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        enabled: z.boolean(),
        order: z.number(),
      }),
    )
    .optional(),
});

// ============================================================================
// Inferred Types
// ============================================================================

export type TemplateSelection = z.infer<typeof templateSelectionSchema>;
export type ContainerConfig = z.infer<typeof containerConfigSchema>;
export type PackageSelection = z.infer<typeof packageSelectionSchema>;
export type ScriptConfig = z.infer<typeof scriptConfigSchema>;
export type WizardState = z.infer<typeof wizardStateSchema>;
export type CreateContainerInput = z.infer<typeof createContainerInputSchema>;
