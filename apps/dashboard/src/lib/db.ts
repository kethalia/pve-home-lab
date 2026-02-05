/**
 * Database Service Layer
 *
 * Centralized database access with connection pooling and Next.js
 * hot-reload support. All database operations go through this class.
 */

import "server-only";

import { PrismaClient } from "@/generated/prisma/client";
import type { ProxmoxNode } from "@/generated/prisma/client";
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
}
