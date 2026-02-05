/// <reference types="node" />
import { beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// Use a dedicated test database to avoid destroying development data
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL?.replace("/dashboard", "/dashboard_test") ||
  "postgresql://dashboard:dashboard@localhost:5432/dashboard_test";

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
