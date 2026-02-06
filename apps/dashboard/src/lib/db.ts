/**
 * Database Service Layer
 *
 * Centralized database access with connection pooling and Next.js
 * hot-reload support. All database operations go through this class.
 */

import "server-only";

import { PrismaClient } from "@/generated/prisma/client";
import type {
  ProxmoxNode,
  Template,
  TemplateScript,
  TemplateFile,
  Package,
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
      // Filter templates whose tags field contains ALL specified tags.
      for (const tag of tags) {
        conditions.push({
          tags: { contains: tag },
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
}
