"use server";

/**
 * Package Bucket Server Actions
 *
 * Server actions for managing package buckets and packages.
 * All use authActionClient for session validation and error handling.
 * All mutations revalidate /templates/packages for fresh UI.
 */

import { revalidatePath } from "next/cache";

import { authActionClient } from "@/lib/safe-action";
import { DatabaseService } from "@/lib/db";
import {
  bucketSchema,
  bucketUpdateSchema,
  addPackageSchema,
  bulkImportSchema,
  idSchema,
} from "@/lib/packages/schemas";
import type { PackageManager } from "@/generated/prisma/client";

// ============================================================================
// Bucket Actions
// ============================================================================

/**
 * Create a new package bucket.
 */
export const createBucketAction = authActionClient
  .schema(bucketSchema)
  .action(async ({ parsedInput }) => {
    await DatabaseService.createBucket(parsedInput);
    revalidatePath("/templates/packages");
    return { message: "Bucket created" };
  });

/**
 * Update an existing package bucket.
 */
export const updateBucketAction = authActionClient
  .schema(bucketUpdateSchema)
  .action(async ({ parsedInput: { id, ...data } }) => {
    await DatabaseService.updateBucket(id, data);
    revalidatePath("/templates/packages");
    return { message: "Bucket updated" };
  });

/**
 * Delete a package bucket (cascade deletes packages).
 */
export const deleteBucketAction = authActionClient
  .schema(idSchema)
  .action(async ({ parsedInput: { id } }) => {
    await DatabaseService.deleteBucket(id);
    revalidatePath("/templates/packages");
    return { message: "Bucket deleted" };
  });

// ============================================================================
// Package Actions
// ============================================================================

/**
 * Add a single package to a bucket.
 */
export const addPackageAction = authActionClient
  .schema(addPackageSchema)
  .action(async ({ parsedInput: { bucketId, name, manager } }) => {
    await DatabaseService.addPackageToBucket(bucketId, {
      name,
      manager: manager as PackageManager,
    });
    revalidatePath("/templates/packages");
    return { message: "Package added" };
  });

/**
 * Remove a package by ID.
 */
export const removePackageAction = authActionClient
  .schema(idSchema)
  .action(async ({ parsedInput: { id } }) => {
    await DatabaseService.removePackage(id);
    revalidatePath("/templates/packages");
    return { message: "Package removed" };
  });

/**
 * Bulk import packages from pasted .apt/.npm content.
 * Parses multi-line content, strips comments (#) and blanks.
 */
export const bulkImportAction = authActionClient
  .schema(bulkImportSchema)
  .action(async ({ parsedInput: { bucketId, content, manager } }) => {
    // Parse content: split by newlines, trim, strip full-line and inline comments, filter blanks
    const packages = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"))
      .map((line) => line.replace(/#.*$/, "").trim())
      .filter((line) => line.length > 0)
      .map((name) => ({ name, manager: manager as PackageManager }));

    if (packages.length === 0) {
      throw new Error("No valid package names found");
    }

    const count = await DatabaseService.bulkAddPackagesToBucket(
      bucketId,
      packages,
    );
    revalidatePath("/templates/packages");
    return {
      message: `Imported ${count} package${count !== 1 ? "s" : ""} (${packages.length - count} duplicates skipped)`,
    };
  });
