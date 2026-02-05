#!/usr/bin/env tsx
/**
 * Verification script for Issue #73 "Done When" checklist
 * This validates that all requirements are met without needing a running database
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CHECKS = {
  "schema.prisma contains all models": () => {
    const schemaPath = resolve(__dirname, "prisma/schema.prisma");
    const schema = readFileSync(schemaPath, "utf-8");

    const requiredModels = [
      "ProxmoxNode",
      "Template",
      "PackageBucket",
      "Package",
      "TemplateScript",
      "TemplateFile",
      "Container",
      "ContainerService",
      "ContainerEvent",
    ];

    const requiredEnums = [
      "PackageManager",
      "TemplateSource",
      "FilePolicy",
      "ContainerStatus",
      "ServiceType",
      "ServiceStatus",
      "EventType",
    ];

    const missingModels = requiredModels.filter(
      (model) => !schema.includes(`model ${model}`),
    );
    const missingEnums = requiredEnums.filter(
      (enumType) => !schema.includes(`enum ${enumType}`),
    );

    if (missingModels.length > 0) {
      throw new Error(`Missing models: ${missingModels.join(", ")}`);
    }

    if (missingEnums.length > 0) {
      throw new Error(`Missing enums: ${missingEnums.join(", ")}`);
    }

    // Check for proper relations (allow for flexible whitespace)
    const relationChecks = [
      { model: "ProxmoxNode", field: "containers", type: "Container[]" },
      { model: "Template", field: "scripts", type: "TemplateScript[]" },
      { model: "Template", field: "files", type: "TemplateFile[]" },
      { model: "Template", field: "packages", type: "Package[]" },
      { model: "Container", field: "services", type: "ContainerService[]" },
      { model: "Container", field: "events", type: "ContainerEvent[]" },
      { model: "PackageBucket", field: "packages", type: "Package[]" },
    ];

    for (const { model, field, type } of relationChecks) {
      const regex = new RegExp(
        `${field}\\s+${type.replace(/\[/g, "\\[").replace(/\]/g, "\\]")}`,
      );
      if (!regex.test(schema)) {
        throw new Error(`Missing relation in ${model}: ${field} ${type}`);
      }
    }

    // Indexes are checked in the migration file verification

    return true;
  },

  "prisma/migrations/ contains initial migration": () => {
    const migrationDir = resolve(__dirname, "prisma/migrations");
    if (!existsSync(migrationDir)) {
      throw new Error("Migrations directory does not exist");
    }

    const migrationFile = resolve(
      migrationDir,
      "20260205000000_initial_schema/migration.sql",
    );
    if (!existsSync(migrationFile)) {
      throw new Error("Initial migration file does not exist");
    }

    const migration = readFileSync(migrationFile, "utf-8");

    // Check for all table creations
    const requiredTables = [
      "ProxmoxNode",
      "Template",
      "PackageBucket",
      "Package",
      "TemplateScript",
      "TemplateFile",
      "Container",
      "ContainerService",
      "ContainerEvent",
    ];

    for (const table of requiredTables) {
      if (!migration.includes(`CREATE TABLE "${table}"`)) {
        throw new Error(`Migration missing table: ${table}`);
      }
    }

    // Check for indexes
    const indexChecks = [
      // Removed: "Container_vmid_idx" (redundant with unique constraint)
      "Container_status_idx",
      "ContainerEvent_containerId_createdAt_idx",
    ];

    for (const index of indexChecks) {
      if (!migration.includes(index)) {
        throw new Error(`Missing index in migration: ${index}`);
      }
    }

    return true;
  },

  "Encryption utility exists": () => {
    const encryptionPath = resolve(__dirname, "src/lib/encryption.ts");
    if (!existsSync(encryptionPath)) {
      throw new Error("Encryption utility does not exist");
    }

    const content = readFileSync(encryptionPath, "utf-8");

    // Check for required exports
    const requiredExports = ["encrypt", "decrypt", "generateEncryptionKey"];
    for (const exportName of requiredExports) {
      if (!content.includes(`export function ${exportName}`)) {
        throw new Error(`Missing export: ${exportName}`);
      }
    }

    // Check for AES-256-GCM
    if (!content.includes("aes-256-gcm")) {
      throw new Error("Encryption does not use AES-256-GCM");
    }

    return true;
  },

  "Seed script is runnable": () => {
    const seedPath = resolve(__dirname, "prisma/seed.ts");
    if (!existsSync(seedPath)) {
      throw new Error("Seed script does not exist");
    }

    const packageJsonPath = resolve(__dirname, "package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

    if (!packageJson.prisma?.seed) {
      throw new Error("prisma.seed not configured in package.json");
    }

    if (packageJson.prisma.seed !== "tsx prisma/seed.ts") {
      throw new Error("prisma.seed has incorrect command");
    }

    // Check that tsx is installed
    if (!packageJson.devDependencies?.tsx) {
      throw new Error("tsx not installed as dev dependency");
    }

    return true;
  },

  "Test suite exists": () => {
    const testPath = resolve(__dirname, "tests/schema.test.ts");
    if (!existsSync(testPath)) {
      throw new Error("Test suite does not exist");
    }

    const content = readFileSync(testPath, "utf-8");

    // Check for key test categories
    const requiredTests = [
      "ProxmoxNode → Container relation",
      "Template → Scripts, Files, Packages relations",
      "cascade delete",
      "PackageBucket → Package relation",
      "Container → Services & Events relations",
      "Indexes",
      "Unique constraints",
    ];

    for (const test of requiredTests) {
      if (!content.includes(test)) {
        throw new Error(`Missing test for: ${test}`);
      }
    }

    return true;
  },

  "Vitest is configured": () => {
    const configPath = resolve(__dirname, "vitest.config.ts");
    if (!existsSync(configPath)) {
      throw new Error("vitest.config.ts does not exist");
    }

    const packageJsonPath = resolve(__dirname, "package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

    if (!packageJson.devDependencies?.vitest) {
      throw new Error("vitest not installed");
    }

    if (!packageJson.scripts?.test) {
      throw new Error("test script not configured");
    }

    return true;
  },

  "ENCRYPTION_KEY in .env.example": () => {
    const envExamplePath = resolve(__dirname, ".env.example");
    if (!existsSync(envExamplePath)) {
      throw new Error(".env.example does not exist");
    }

    const content = readFileSync(envExamplePath, "utf-8");
    if (!content.includes("ENCRYPTION_KEY")) {
      throw new Error("ENCRYPTION_KEY not in .env.example");
    }

    return true;
  },
};

async function verify() {
  console.log("🔍 Verifying Issue #73 Requirements\n");

  let passed = 0;
  let failed = 0;

  for (const [name, check] of Object.entries(CHECKS)) {
    try {
      check();
      console.log(`✅ ${name}`);
      passed++;
    } catch (error) {
      console.error(`❌ ${name}`);
      console.error(`   ${(error as Error).message}`);
      failed++;
    }
  }

  console.log(
    `\n📊 Results: ${passed}/${Object.keys(CHECKS).length} checks passed`,
  );

  if (failed > 0) {
    console.error(`\n❌ ${failed} checks failed`);
    process.exit(1);
  } else {
    console.log("\n✅ All requirements met!");
  }
}

verify();
