/// <reference types="node" />
import { beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// Use a dedicated test database to avoid destroying development data
function getTestDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) {
    return process.env.TEST_DATABASE_URL;
  }

  if (process.env.DATABASE_URL) {
    try {
      // Parse and safely append _test suffix to database name
      const url = new URL(process.env.DATABASE_URL);
      const dbName = url.pathname.slice(1); // Remove leading /
      url.pathname = `/${dbName}_test`;
      return url.toString();
    } catch (error) {
      console.error("Invalid DATABASE_URL format:", error);
      // Fall through to default
    }
  }

  // Default test database URL
  return "postgresql://dashboard:dashboard@localhost:5432/dashboard_test";
}

const testDatabaseUrl = getTestDatabaseUrl();

const pool = new Pool({ connectionString: testDatabaseUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

beforeAll(async () => {
  // Ensure database connection is ready
  await prisma.$connect();
});

beforeEach(async () => {
  // Clean up all tables before each test
  // Order matters due to foreign key constraints
  await prisma.containerEvent.deleteMany();
  await prisma.containerService.deleteMany();
  await prisma.container.deleteMany();
  await prisma.package.deleteMany();
  await prisma.packageBucket.deleteMany();
  await prisma.templateScript.deleteMany();
  await prisma.templateFile.deleteMany();
  await prisma.template.deleteMany();
  await prisma.proxmoxNode.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

export { prisma };
