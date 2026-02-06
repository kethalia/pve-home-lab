"use server";

/**
 * Template Server Actions
 *
 * Server actions for template discovery, status checking, and mutations.
 * All use authActionClient for session validation and error handling.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { authActionClient } from "@/lib/safe-action";
import { DatabaseService, prisma } from "@/lib/db";
import { idSchema } from "@/lib/packages/schemas";

import { discoverTemplates } from "./discovery";

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
