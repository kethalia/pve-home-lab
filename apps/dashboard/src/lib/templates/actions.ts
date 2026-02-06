"use server";

/**
 * Template Server Actions
 *
 * Server actions for template discovery, status checking, and mutations.
 * All actions use authActionClient (next-safe-action) for consistent
 * auth handling, validation, and error responses.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { authActionClient } from "@/lib/safe-action";
import { DatabaseService, prisma } from "@/lib/db";
import { idSchema } from "@/lib/packages/schemas";

import { discoverTemplates } from "./discovery";
import { templateFormSchema, templateUpdateSchema } from "./schemas";

// ============================================================================
// Discovery Actions
// ============================================================================

/**
 * Trigger a full template discovery scan.
 *
 * Scans the infra/lxc/templates/ directory, parses all templates,
 * and upserts them into the database.
 */
export const discoverTemplatesAction = authActionClient.action(async () => {
  const result = await discoverTemplates();
  revalidatePath("/templates");
  return result;
});

/**
 * Get the current discovery status.
 *
 * Returns the count of filesystem-sourced templates and the most
 * recent update timestamp, useful for UI "Last synced: ..." display.
 */
export const getDiscoveryStatusAction = authActionClient.action(async () => {
  const [count, latest] = await Promise.all([
    prisma.template.count({
      where: { source: "filesystem" },
    }),
    prisma.template.findFirst({
      where: { source: "filesystem" },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
  ]);

  return {
    templateCount: count,
    lastDiscovery: latest?.updatedAt?.toISOString() ?? null,
  };
});

/**
 * Delete a template by ID.
 *
 * Cascading deletes handle related scripts, files, and packages.
 * On success, redirects to the templates list.
 */
export const deleteTemplateAction = authActionClient
  .schema(idSchema)
  .action(async ({ parsedInput: { id } }) => {
    await DatabaseService.deleteTemplate(id);
    revalidatePath("/templates");
    redirect("/templates");
  });

// ============================================================================
// Template CRUD Actions (safe-action based)
// ============================================================================

/**
 * Helper to map validated form data to DatabaseService input shape.
 */
function toDbInput(data: {
  name: string;
  description?: string;
  osTemplate?: string;
  cores?: number | null;
  memory?: number | null;
  swap?: number | null;
  diskSize?: number | null;
  storage?: string;
  bridge?: string;
  unprivileged: boolean;
  nesting: boolean;
  keyctl: boolean;
  fuse: boolean;
  tags?: string;
  scripts: {
    name: string;
    order: number;
    content: string;
    description?: string;
    enabled: boolean;
  }[];
  files: {
    name: string;
    targetPath: string;
    policy: string;
    content: string;
  }[];
  bucketIds: string[];
}) {
  return {
    name: data.name,
    description: data.description || undefined,
    osTemplate: data.osTemplate || undefined,
    cores: data.cores ?? undefined,
    memory: data.memory ?? undefined,
    swap: data.swap ?? undefined,
    diskSize: data.diskSize ?? undefined,
    storage: data.storage || undefined,
    bridge: data.bridge || undefined,
    unprivileged: data.unprivileged,
    nesting: data.nesting,
    keyctl: data.keyctl,
    fuse: data.fuse,
    tags: data.tags || undefined,
    scripts: data.scripts.length > 0 ? data.scripts : undefined,
    files:
      data.files.length > 0
        ? data.files.map((f) => ({
            ...f,
            policy: f.policy as "replace" | "default" | "backup",
          }))
        : undefined,
    bucketIds: data.bucketIds.length > 0 ? data.bucketIds : undefined,
  };
}

/**
 * Create a new template.
 *
 * Validates with Zod, creates template atomically via DatabaseService,
 * and returns the new template ID for client-side redirect.
 */
export const createTemplateAction = authActionClient
  .schema(templateFormSchema)
  .action(async ({ parsedInput }) => {
    const template = await DatabaseService.createTemplate(
      toDbInput(parsedInput),
    );
    revalidatePath("/templates");
    return { templateId: template.id };
  });

/**
 * Update an existing template.
 *
 * Validates with Zod (including ID), updates template and all
 * associated data atomically, and returns the template ID.
 */
export const updateTemplateAction = authActionClient
  .schema(templateUpdateSchema)
  .action(async ({ parsedInput: { id, ...data } }) => {
    await DatabaseService.updateTemplate(id, {
      ...toDbInput(data),
      scripts: data.scripts,
      files: data.files.map((f) => ({
        ...f,
        policy: f.policy as "replace" | "default" | "backup",
      })),
      bucketIds: data.bucketIds,
    });
    revalidatePath("/templates");
    revalidatePath(`/templates/${id}`);
    return { templateId: id };
  });
