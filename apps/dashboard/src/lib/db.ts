/**
 * Database Service Layer
 *
 * Centralized database access with connection pooling and Next.js
 * hot-reload support. All database operations go through this class.
 */

// Server-side module — do not import from client components

import { PrismaClient } from "@/generated/prisma/client";
import type {
  ProxmoxNode,
  Template,
  TemplateScript,
  TemplateFile,
  Package,
  PackageBucket,
  PackageManager,
  FilePolicy,
} from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient;
  pool: Pool;
};

const pool =
  globalForPrisma.pool ||
  new Pool({
    connectionString: process.env.DATABASE_URL,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.pool = pool;
}

const adapter = new PrismaPg(pool);
const prismaInstance = globalForPrisma.prisma || new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prismaInstance;
}

/** Direct Prisma instance export for complex operations (e.g., transactions) */
export { prismaInstance as prisma };

// ============================================================================
// Derived Types
// ============================================================================

/** Template with related record counts (scripts, files, packages) */
export type TemplateWithCounts = Template & {
  _count: { scripts: number; files: number; packages: number };
};

/** Template with all related data fully loaded */
export type TemplateWithDetails = Template & {
  scripts: TemplateScript[];
  files: TemplateFile[];
  packages: Package[];
};

/** PackageBucket with all packages included */
export type BucketWithPackages = PackageBucket & {
  packages: Package[];
};

/** Input for creating a new template with all related data */
export interface CreateTemplateInput {
  name: string;
  description?: string;
  osTemplate?: string;
  cores?: number;
  memory?: number;
  swap?: number;
  diskSize?: number;
  storage?: string;
  bridge?: string;
  unprivileged?: boolean;
  nesting?: boolean;
  keyctl?: boolean;
  fuse?: boolean;
  tags?: string;
  scripts?: {
    name: string;
    order: number;
    content: string;
    description?: string;
    enabled?: boolean;
  }[];
  files?: {
    name: string;
    targetPath: string;
    policy: FilePolicy;
    content: string;
  }[];
  bucketIds?: string[];
}

/** Input for updating an existing template (all fields optional) */
export type UpdateTemplateInput = Partial<CreateTemplateInput>;

/**
 * Database Service - Centralized data access layer
 * All database operations should go through this service
 */
export class DatabaseService {
  private static prisma = prismaInstance;

  // ============================================================================
  // ProxmoxNode Operations
  // ============================================================================

  /**
   * Get a Proxmox node by ID
   */
  static async getNodeById(id: string): Promise<ProxmoxNode | null> {
    return this.prisma.proxmoxNode.findUnique({ where: { id } });
  }

  /**
   * Get a Proxmox node by name
   */
  static async getNodeByName(name: string): Promise<ProxmoxNode | null> {
    return this.prisma.proxmoxNode.findUnique({ where: { name } });
  }

  /**
   * List all Proxmox nodes
   */
  static async listNodes(): Promise<ProxmoxNode[]> {
    return this.prisma.proxmoxNode.findMany();
  }

  /**
   * Create a new Proxmox node
   */
  static async createNode(data: {
    name: string;
    host: string;
    port?: number;
    tokenId: string;
    tokenSecret: string;
    fingerprint?: string;
  }): Promise<ProxmoxNode> {
    return this.prisma.proxmoxNode.create({ data });
  }

  /**
   * Update an existing Proxmox node
   */
  static async updateNode(
    id: string,
    data: Partial<{
      name: string;
      host: string;
      port: number;
      tokenId: string;
      tokenSecret: string;
      fingerprint: string | null;
    }>,
  ): Promise<ProxmoxNode> {
    return this.prisma.proxmoxNode.update({ where: { id }, data });
  }

  /**
   * Delete a Proxmox node
   */
  static async deleteNode(id: string): Promise<void> {
    await this.prisma.proxmoxNode.delete({ where: { id } });
  }

  // ============================================================================
  // Template Operations
  // ============================================================================

  /**
   * List templates with optional search, tag filtering, and sorting.
   * Returns templates with counts of related scripts, files, and packages.
   */
  static async listTemplates(
    options: {
      search?: string;
      tags?: string[];
      orderBy?: "name" | "updatedAt";
    } = {},
  ): Promise<TemplateWithCounts[]> {
    const { search, tags, orderBy = "name" } = options;

    // Build where clause dynamically
    const conditions: Record<string, unknown>[] = [];

    if (search) {
      conditions.push({
        name: { contains: search, mode: "insensitive" },
      });
    }

    if (tags && tags.length > 0) {
      // Tags are stored as semicolon-separated strings.
      // Match whole tags only, not substrings (e.g. "web" must not match "webapp").
      for (const tag of tags) {
        conditions.push({
          OR: [
            { tags: tag },
            { tags: { startsWith: `${tag};` } },
            { tags: { endsWith: `;${tag}` } },
            { tags: { contains: `;${tag};` } },
          ],
        });
      }
    }

    const where = conditions.length > 0 ? { AND: conditions } : {};

    return this.prisma.template.findMany({
      where,
      orderBy: { [orderBy]: orderBy === "name" ? "asc" : "desc" },
      include: {
        _count: {
          select: { scripts: true, files: true, packages: true },
        },
      },
    });
  }

  /**
   * Get a single template by ID with all related data.
   */
  static async getTemplateById(
    id: string,
  ): Promise<TemplateWithDetails | null> {
    return this.prisma.template.findUnique({
      where: { id },
      include: {
        scripts: { orderBy: { order: "asc" } },
        files: true,
        packages: true,
      },
    });
  }

  /**
   * Get all unique tags across all templates.
   * Tags are stored as semicolon-separated strings in the tags field.
   */
  static async getTemplateTags(): Promise<string[]> {
    const templates = await this.prisma.template.findMany({
      select: { tags: true },
      where: { tags: { not: null } },
    });

    const tagSet = new Set<string>();

    for (const t of templates) {
      if (t.tags) {
        for (const tag of t.tags.split(";")) {
          const trimmed = tag.trim();
          if (trimmed) {
            tagSet.add(trimmed);
          }
        }
      }
    }

    return Array.from(tagSet).sort();
  }

  /**
   * Get total count of templates.
   */
  static async getTemplateCount(): Promise<number> {
    return this.prisma.template.count();
  }

  /**
   * Delete a template by ID (cascading deletes handle related records).
   */
  static async deleteTemplate(id: string): Promise<void> {
    await this.prisma.template.delete({ where: { id } });
  }

  /**
   * Create a new template with scripts, files, and bucket-linked packages atomically.
   */
  static async createTemplate(
    data: CreateTemplateInput,
  ): Promise<TemplateWithDetails> {
    const { scripts, files, bucketIds, ...templateData } = data;

    return this.prisma.$transaction(async (tx) => {
      // Create the template with base fields
      const template = await tx.template.create({
        data: {
          ...templateData,
          source: "custom",
          scripts: scripts
            ? {
                create: scripts.map((s) => ({
                  name: s.name,
                  order: s.order,
                  content: s.content,
                  description: s.description,
                  enabled: s.enabled ?? true,
                })),
              }
            : undefined,
          files: files
            ? {
                create: files.map((f) => ({
                  name: f.name,
                  targetPath: f.targetPath,
                  policy: f.policy,
                  content: f.content,
                })),
              }
            : undefined,
        },
        include: {
          scripts: { orderBy: { order: "asc" } },
          files: true,
          packages: true,
        },
      });

      // Copy packages from selected buckets into template
      if (bucketIds && bucketIds.length > 0) {
        const bucketPackages = await tx.package.findMany({
          where: { bucketId: { in: bucketIds } },
        });

        // De-duplicate packages by manager/name/version so the template
        // does not end up with multiple identical package entries.
        const seen = new Set<string>();
        const unique = bucketPackages.filter((p) => {
          const key = `${p.manager}::${p.name}::${p.version ?? ""}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        if (unique.length > 0) {
          await tx.package.createMany({
            data: unique.map((p) => ({
              name: p.name,
              manager: p.manager,
              version: p.version,
              templateId: template.id,
            })),
          });
        }

        // Re-fetch with packages
        return tx.template.findUniqueOrThrow({
          where: { id: template.id },
          include: {
            scripts: { orderBy: { order: "asc" } },
            files: true,
            packages: true,
          },
        });
      }

      return template;
    });
  }

  /**
   * Update an existing template with full replace of scripts, files, and packages.
   * Uses delete+recreate strategy for child records to handle reordering cleanly.
   */
  static async updateTemplate(
    id: string,
    data: UpdateTemplateInput,
  ): Promise<TemplateWithDetails> {
    const { scripts, files, bucketIds, ...templateData } = data;

    return this.prisma.$transaction(async (tx) => {
      // Update base template fields
      await tx.template.update({
        where: { id },
        data: templateData,
      });

      // Replace scripts (delete all, create new)
      if (scripts !== undefined) {
        await tx.templateScript.deleteMany({ where: { templateId: id } });
        if (scripts.length > 0) {
          await tx.templateScript.createMany({
            data: scripts.map((s) => ({
              name: s.name,
              order: s.order,
              content: s.content,
              description: s.description,
              enabled: s.enabled ?? true,
              templateId: id,
            })),
          });
        }
      }

      // Replace files (delete all, create new)
      if (files !== undefined) {
        await tx.templateFile.deleteMany({ where: { templateId: id } });
        if (files.length > 0) {
          await tx.templateFile.createMany({
            data: files.map((f) => ({
              name: f.name,
              targetPath: f.targetPath,
              policy: f.policy,
              content: f.content,
              templateId: id,
            })),
          });
        }
      }

      // Replace template-linked packages (from bucket selections)
      if (bucketIds !== undefined) {
        await tx.package.deleteMany({ where: { templateId: id } });

        if (bucketIds.length > 0) {
          const bucketPackages = await tx.package.findMany({
            where: { bucketId: { in: bucketIds } },
          });

          // De-duplicate by manager/name/version
          const seen = new Set<string>();
          const unique = bucketPackages.filter((p) => {
            const key = `${p.manager}::${p.name}::${p.version ?? ""}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });

          if (unique.length > 0) {
            await tx.package.createMany({
              data: unique.map((p) => ({
                name: p.name,
                manager: p.manager,
                version: p.version,
                templateId: id,
              })),
            });
          }
        }
      }

      // Return updated template with all relations
      return tx.template.findUniqueOrThrow({
        where: { id },
        include: {
          scripts: { orderBy: { order: "asc" } },
          files: true,
          packages: true,
        },
      });
    });
  }

  // ============================================================================
  // PackageBucket Operations
  // ============================================================================

  /**
   * List all package buckets with their packages included.
   */
  static async listBuckets(): Promise<BucketWithPackages[]> {
    return this.prisma.packageBucket.findMany({
      orderBy: { name: "asc" },
      include: { packages: true },
    });
  }

  /**
   * Get a single bucket by ID with packages included.
   */
  static async getBucketById(id: string): Promise<BucketWithPackages | null> {
    return this.prisma.packageBucket.findUnique({
      where: { id },
      include: { packages: true },
    });
  }

  /**
   * Create a new package bucket.
   */
  static async createBucket(data: {
    name: string;
    description?: string;
  }): Promise<PackageBucket> {
    return this.prisma.packageBucket.create({ data });
  }

  /**
   * Update an existing package bucket.
   */
  static async updateBucket(
    id: string,
    data: { name?: string; description?: string },
  ): Promise<PackageBucket> {
    return this.prisma.packageBucket.update({ where: { id }, data });
  }

  /**
   * Delete a package bucket. Throws if bucket has packages.
   * Uses a transaction to ensure the check and delete are atomic.
   */
  static async deleteBucket(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.package.deleteMany({ where: { bucketId: id } });
      await tx.packageBucket.delete({ where: { id } });
    });
  }

  /**
   * Add a single package to a bucket.
   */
  static async addPackageToBucket(
    bucketId: string,
    data: { name: string; manager: PackageManager; version?: string },
  ): Promise<Package> {
    return this.prisma.package.create({
      data: { ...data, bucketId },
    });
  }

  /**
   * Remove a package by ID.
   */
  static async removePackage(id: string): Promise<void> {
    await this.prisma.package.delete({ where: { id } });
  }

  /**
   * Bulk add packages to a bucket. Skips duplicates (same name in bucket).
   * Returns the count of newly created packages.
   */
  static async bulkAddPackagesToBucket(
    bucketId: string,
    packages: { name: string; manager: PackageManager }[],
  ): Promise<number> {
    // Query existing package names in bucket to skip duplicates
    const existing = await this.prisma.package.findMany({
      where: { bucketId },
      select: { name: true },
    });
    const existingNames = new Set(existing.map((p) => p.name));

    const newPackages = packages.filter((p) => !existingNames.has(p.name));
    if (newPackages.length === 0) return 0;

    const result = await this.prisma.package.createMany({
      data: newPackages.map((p) => ({ ...p, bucketId })),
      skipDuplicates: true,
    });
    return result.count;
  }

  /**
   * Get the total count of package buckets.
   */
  static async getBucketCount(): Promise<number> {
    return this.prisma.packageBucket.count();
  }
}
