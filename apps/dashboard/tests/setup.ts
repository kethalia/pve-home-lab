import { beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";

// Use a test database URL or the regular one
const prisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL ||
        "postgresql://dashboard:dashboard@localhost:5432/dashboard",
    },
  },
});

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
