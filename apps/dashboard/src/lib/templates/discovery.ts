/**
 * Template Discovery Engine
 *
 * Scans the filesystem for LXC templates and upserts them into the database.
 * Uses parser functions for filesystem reading and Prisma for database sync.
 */

import "server-only";

import path from "node:path";

import type { FilePolicy, PackageManager } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

import {
  discoverTemplateDirs,
  parseFullTemplate,
  type ParsedFile,
  type ParsedPackageBucket,
  type ParsedScript,
  type ParsedTemplate,
} from "./parser";

// =============================================================================
// Types
// =============================================================================

export interface DiscoveryResult {
  discovered: number;
  templates: {
    name: string;
    scripts: number;
    packages: number;
    files: number;
  }[];
  errors: { template: string; error: string }[];
}

// =============================================================================
// File Policy Mapping
// =============================================================================

const FILE_POLICY_MAP: Record<string, FilePolicy> = {
  replace: "replace",
  default: "default",
  backup: "backup",
};

function toFilePolicy(policy: string): FilePolicy {
  return FILE_POLICY_MAP[policy.toLowerCase()] ?? "replace";
}

// =============================================================================
// Package Manager Mapping
// =============================================================================

const PACKAGE_MANAGER_MAP: Record<string, PackageManager> = {
  apt: "apt",
  npm: "npm",
  pip: "pip",
};

function toPackageManager(manager: string): PackageManager {
  return PACKAGE_MANAGER_MAP[manager.toLowerCase()] ?? "apt";
}

// =============================================================================
// Discovery Engine
// =============================================================================

/**
 * Upsert a single parsed template and all its related records into the database.
 *
 * Uses a Prisma transaction to ensure atomicity — either all records
 * for a template are synced, or none are.
 */
async function syncTemplateToDb(parsed: {
  template: ParsedTemplate;
  scripts: ParsedScript[];
  packages: ParsedPackageBucket[];
  files: ParsedFile[];
}): Promise<{ scripts: number; packages: number; files: number }> {
  const { template, scripts, packages, files } = parsed;

  return prisma.$transaction(async (tx) => {
    // 1. Upsert Template
    const dbTemplate = await tx.template.upsert({
      where: { name: template.name },
      create: {
        name: template.name,
        description: template.description || null,
        source: "filesystem",
        path: template.path,
        osTemplate: template.osTemplate,
        cores: template.cores,
        memory: template.memory,
        diskSize: template.diskSize,
        unprivileged: template.unprivileged,
        nesting: template.nesting,
        keyctl: template.keyctl,
        fuse: template.fuse,
        tags: template.tags.join(";"),
      },
      update: {
        description: template.description || null,
        source: "filesystem",
        path: template.path,
        osTemplate: template.osTemplate,
        cores: template.cores,
        memory: template.memory,
        diskSize: template.diskSize,
        unprivileged: template.unprivileged,
        nesting: template.nesting,
        keyctl: template.keyctl,
        fuse: template.fuse,
        tags: template.tags.join(";"),
      },
    });

    // 2. Sync Scripts — delete existing, recreate from parsed data
    await tx.templateScript.deleteMany({
      where: { templateId: dbTemplate.id },
    });

    if (scripts.length > 0) {
      await tx.templateScript.createMany({
        data: scripts.map((s) => ({
          name: s.fullName,
          order: s.order,
          content: s.content,
          templateId: dbTemplate.id,
        })),
      });
    }

    // 3. Sync Files — delete existing, recreate from parsed data
    await tx.templateFile.deleteMany({
      where: { templateId: dbTemplate.id },
    });

    if (files.length > 0) {
      await tx.templateFile.createMany({
        data: files.map((f) => ({
          name: f.name,
          targetPath: f.targetPath,
          policy: toFilePolicy(f.policy),
          content: f.content,
          templateId: dbTemplate.id,
        })),
      });
    }

    // 4. Sync Packages — upsert buckets, delete+recreate packages in each
    let totalPackages = 0;

    for (const bucket of packages) {
      const dbBucket = await tx.packageBucket.upsert({
        where: { name: bucket.name },
        create: {
          name: bucket.name,
          description: `${bucket.manager} packages`,
        },
        update: {
          // Re-sync description on re-run
          description: `${bucket.manager} packages`,
        },
      });

      // Delete existing packages in this bucket
      await tx.package.deleteMany({
        where: { bucketId: dbBucket.id },
      });

      // Create packages in the bucket
      if (bucket.packages.length > 0) {
        await tx.package.createMany({
          data: bucket.packages.map((pkg) => ({
            name: pkg,
            manager: toPackageManager(bucket.manager),
            bucketId: dbBucket.id,
          })),
        });
      }

      totalPackages += bucket.packages.length;
    }

    return {
      scripts: scripts.length,
      packages: totalPackages,
      files: files.length,
    };
  });
}

/**
 * Discover all templates from the filesystem and sync to the database.
 *
 * Scans the given root directory (or default infra/lxc/templates/) for
 * template directories containing template.conf, parses each template
 * fully, and upserts all data into the database.
 *
 * Idempotent: running twice produces the same database state.
 */
export async function discoverTemplates(
  rootDir?: string,
): Promise<DiscoveryResult> {
  const templatesRoot =
    rootDir ??
    process.env.TEMPLATES_ROOT ??
    path.resolve(process.cwd(), "../../infra/lxc/templates");

  const templateDirs = await discoverTemplateDirs(templatesRoot);

  const result: DiscoveryResult = {
    discovered: templateDirs.length,
    templates: [],
    errors: [],
  };

  for (const dir of templateDirs) {
    const templateName = path.basename(dir);

    try {
      const parsed = await parseFullTemplate(dir);
      const counts = await syncTemplateToDb(parsed);

      result.templates.push({
        name: templateName,
        scripts: counts.scripts,
        packages: counts.packages,
        files: counts.files,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[template-discovery] Failed to sync template "${templateName}":`,
        message,
      );
      result.errors.push({
        template: templateName,
        error: message,
      });
    }
  }

  return result;
}
