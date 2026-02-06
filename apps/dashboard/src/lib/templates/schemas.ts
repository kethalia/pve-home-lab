/**
 * Shared Zod schemas for template operations.
 * Used by both server actions (validation) and client forms (react-hook-form).
 */

import { z } from "zod";

export const scriptSchema = z.object({
  name: z.string().min(1, "Script name is required"),
  order: z.number().int().min(0),
  content: z.string().min(1, "Script content is required"),
  description: z.string().optional(),
  enabled: z.boolean().default(true),
});

export const fileSchema = z.object({
  name: z.string().min(1, "File name is required"),
  targetPath: z.string().min(1, "Target path is required"),
  policy: z.enum(["replace", "default", "backup"]),
  content: z.string().min(1, "File content is required"),
});

export const templateFormSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be 100 characters or less"),
  description: z
    .string()
    .max(500, "Description must be 500 characters or less")
    .optional()
    .or(z.literal("")),
  osTemplate: z.string().optional().or(z.literal("")),
  cores: z.number().int().min(1).max(64).optional().nullable(),
  memory: z.number().int().min(128).max(131072).optional().nullable(),
  swap: z.number().int().min(0).max(131072).optional().nullable(),
  diskSize: z.number().int().min(1).max(10000).optional().nullable(),
  storage: z.string().optional().or(z.literal("")),
  bridge: z.string().optional().or(z.literal("")),
  unprivileged: z.boolean().default(true),
  nesting: z.boolean().default(false),
  keyctl: z.boolean().default(false),
  fuse: z.boolean().default(false),
  tags: z.string().optional().or(z.literal("")),
  scripts: z.array(scriptSchema).optional().default([]),
  files: z.array(fileSchema).optional().default([]),
  bucketIds: z.array(z.string()).optional().default([]),
});

/** Schema for updating a template (includes ID). */
export const templateUpdateSchema = templateFormSchema.extend({
  id: z.string().min(1, "Template ID is required"),
});

/** Output type (after defaults applied) — used by server actions. */
export type TemplateFormValues = z.infer<typeof templateFormSchema>;

/** Input type (before defaults) — used by react-hook-form resolver. */
export type TemplateFormInput = z.input<typeof templateFormSchema>;
