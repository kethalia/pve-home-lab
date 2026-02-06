"use server";

/**
 * Template Server Actions
 *
 * Server actions for template discovery, status checking, and mutations.
 * Uses authActionClient for safe-action-based operations and standard
 * server actions with useActionState for form-based create/update flows.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isRedirectError } from "next/dist/client/components/redirect-error";

import { authActionClient } from "@/lib/safe-action";
import { DatabaseService, prisma } from "@/lib/db";
import { idSchema } from "@/lib/packages/schemas";
import { getSessionData } from "@/lib/session";

import { discoverTemplates } from "./discovery";

// ============================================================================
// Types
// ============================================================================

/** State returned by form-based server actions for useActionState */
export type ActionState = {
  success: boolean;
  error?: string;
};

// ============================================================================
// Zod Validation Schema
// ============================================================================

const scriptSchema = z.object({
  name: z.string().min(1, "Script name is required"),
  order: z.number().int().min(0),
  content: z.string().min(1, "Script content is required"),
  description: z.string().optional(),
  enabled: z.boolean().default(true),
});

const fileSchema = z.object({
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

export type TemplateFormValues = z.infer<typeof templateFormSchema>;

// ============================================================================
// Helpers
// ============================================================================

/** Parse formData into a structured object for Zod validation */
function parseFormData(formData: FormData) {
  const optionalInt = (key: string): number | null | undefined => {
    const val = formData.get(key);
    if (!val || val === "") return null;
    const num = Number(val);
    return isNaN(num) ? null : num;
  };

  const scriptsRaw = formData.get("scripts") as string;
  const filesRaw = formData.get("files") as string;
  const bucketIdsRaw = formData.get("bucketIds") as string;

  let scripts: unknown[] = [];
  let files: unknown[] = [];
  let bucketIds: string[] = [];

  try {
    scripts = scriptsRaw ? JSON.parse(scriptsRaw) : [];
  } catch {
    scripts = [];
  }

  try {
    files = filesRaw ? JSON.parse(filesRaw) : [];
  } catch {
    files = [];
  }

  if (bucketIdsRaw) {
    bucketIds = bucketIdsRaw.split(",").filter(Boolean);
  }

  return {
    name: (formData.get("name") as string) || "",
    description: (formData.get("description") as string) || "",
    osTemplate: (formData.get("osTemplate") as string) || "",
    cores: optionalInt("cores"),
    memory: optionalInt("memory"),
    swap: optionalInt("swap"),
    diskSize: optionalInt("diskSize"),
    storage: (formData.get("storage") as string) || "",
    bridge: (formData.get("bridge") as string) || "",
    unprivileged: formData.get("unprivileged") === "true",
    nesting: formData.get("nesting") === "true",
    keyctl: formData.get("keyctl") === "true",
    fuse: formData.get("fuse") === "true",
    tags: (formData.get("tags") as string) || "",
    scripts,
    files,
    bucketIds,
  };
}

// ============================================================================
// Discovery Actions (safe-action based)
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
// Form-based Actions (for useActionState)
// ============================================================================

/**
 * Create a new template from form data.
 *
 * Parses formData, validates with Zod, creates template atomically,
 * and redirects to the new template's detail page on success.
 */
export async function createTemplateAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // Auth check
  const session = await getSessionData();
  if (!session) {
    return { success: false, error: "Unauthorized" };
  }

  // Parse and validate
  const raw = parseFormData(formData);
  const parsed = templateFormSchema.safeParse(raw);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Validation failed",
    };
  }

  const {
    name,
    description,
    osTemplate,
    cores,
    memory,
    swap,
    diskSize,
    storage,
    bridge,
    unprivileged,
    nesting,
    keyctl,
    fuse,
    tags,
    scripts,
    files,
    bucketIds,
  } = parsed.data;

  try {
    const template = await DatabaseService.createTemplate({
      name,
      description: description || undefined,
      osTemplate: osTemplate || undefined,
      cores: cores ?? undefined,
      memory: memory ?? undefined,
      swap: swap ?? undefined,
      diskSize: diskSize ?? undefined,
      storage: storage || undefined,
      bridge: bridge || undefined,
      unprivileged,
      nesting,
      keyctl,
      fuse,
      tags: tags || undefined,
      scripts: scripts.length > 0 ? scripts : undefined,
      files:
        files.length > 0
          ? files.map((f) => ({
              ...f,
              policy: f.policy as "replace" | "default" | "backup",
            }))
          : undefined,
      bucketIds: bucketIds.length > 0 ? bucketIds : undefined,
    });

    revalidatePath("/templates");
    redirect(`/templates/${template.id}`);
  } catch (error) {
    // redirect() throws a special error — re-throw it
    if (isRedirectError(error)) {
      throw error;
    }
    const message =
      error instanceof Error ? error.message : "Failed to create template";
    return { success: false, error: message };
  }
}

/**
 * Update an existing template from form data.
 *
 * Parses formData, validates with Zod, updates template and all
 * associated data atomically, and redirects to the detail page.
 */
export async function updateTemplateAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // Auth check
  const session = await getSessionData();
  if (!session) {
    return { success: false, error: "Unauthorized" };
  }

  const id = formData.get("id") as string;
  if (!id) {
    return { success: false, error: "Template ID is required" };
  }

  // Parse and validate
  const raw = parseFormData(formData);
  const parsed = templateFormSchema.safeParse(raw);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Validation failed",
    };
  }

  const {
    name,
    description,
    osTemplate,
    cores,
    memory,
    swap,
    diskSize,
    storage,
    bridge,
    unprivileged,
    nesting,
    keyctl,
    fuse,
    tags,
    scripts,
    files,
    bucketIds,
  } = parsed.data;

  try {
    await DatabaseService.updateTemplate(id, {
      name,
      description: description || undefined,
      osTemplate: osTemplate || undefined,
      cores: cores ?? undefined,
      memory: memory ?? undefined,
      swap: swap ?? undefined,
      diskSize: diskSize ?? undefined,
      storage: storage || undefined,
      bridge: bridge || undefined,
      unprivileged,
      nesting,
      keyctl,
      fuse,
      tags: tags || undefined,
      scripts: scripts,
      files: files.map((f) => ({
        ...f,
        policy: f.policy as "replace" | "default" | "backup",
      })),
      bucketIds,
    });

    revalidatePath("/templates");
    revalidatePath(`/templates/${id}`);
    redirect(`/templates/${id}`);
  } catch (error) {
    // redirect() throws a special error — re-throw it
    if (isRedirectError(error)) {
      throw error;
    }
    const message =
      error instanceof Error ? error.message : "Failed to update template";
    return { success: false, error: message };
  }
}
