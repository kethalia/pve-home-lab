/**
 * Shared Zod schemas for package bucket operations.
 * Used by both server actions (validation) and client forms (react-hook-form).
 */

import { z } from "zod";

export const bucketSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(50, "Name must be 50 characters or less"),
  description: z
    .string()
    .max(200, "Description must be 200 characters or less")
    .optional()
    .or(z.literal("")),
});

export const bucketUpdateSchema = bucketSchema.extend({
  id: z.string().min(1, "Bucket ID is required"),
});

export const packageSchema = z.object({
  name: z.string().min(1, "Package name is required"),
  manager: z.enum(["apt", "npm", "pip", "custom"]),
});

export const addPackageSchema = packageSchema.extend({
  bucketId: z.string().min(1, "Bucket ID is required"),
});

/** Schema for the bulk import form (client-side — no bucketId). */
export const bulkImportFormSchema = z.object({
  content: z.string().min(1, "Paste package content to import"),
  manager: z.enum(["apt", "npm", "pip", "custom"]),
});

/** Full schema for the bulk import server action (includes bucketId). */
export const bulkImportSchema = bulkImportFormSchema.extend({
  bucketId: z.string().min(1, "Bucket ID is required"),
});

export const idSchema = z.object({
  id: z.string().min(1, "ID is required"),
});

export type BucketFormValues = z.infer<typeof bucketSchema>;
export type PackageFormValues = z.infer<typeof packageSchema>;
export type BulkImportFormValues = z.infer<typeof bulkImportFormSchema>;
