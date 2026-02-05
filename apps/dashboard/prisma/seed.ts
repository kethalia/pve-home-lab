import { PrismaClient } from "@prisma/client";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join, resolve } from "path";

const prisma = new PrismaClient();

const TEMPLATE_PATH = resolve(
  __dirname,
  "../../../infra/lxc/templates/web3-dev",
);
const CONFIGS_PATH = join(TEMPLATE_PATH, "container-configs");

interface TemplateConfig {
  name: string;
  description: string;
  tags: string[];
  cores: number;
  memory: number;
  swap?: number;
  diskSize: number;
  osTemplate: string;
  osVersion: string;
  unprivileged: boolean;
  nesting: boolean;
  keyctl: boolean;
  fuse: boolean;
}

function parseTemplateConfig(): TemplateConfig {
  const configPath = join(TEMPLATE_PATH, "template.conf");
  const content = readFileSync(configPath, "utf-8");

  const getValue = (key: string, defaultValue?: string): string => {
    const regex = new RegExp(`^${key}=["']?([^"'\\n]+)["']?`, "m");
    const match = content.match(regex);
    return match ? match[1] : defaultValue || "";
  };

  const getNumber = (key: string, defaultValue: number): number => {
    const value = getValue(key);
    return value ? parseInt(value, 10) : defaultValue;
  };

  const getBoolean = (key: string, defaultValue: boolean): boolean => {
    const value = getValue(key);
    return value === "1" || value === "true";
  };

  return {
    name: getValue("TEMPLATE_APP", "Web3 Dev Container"),
    description: getValue(
      "TEMPLATE_DESCRIPTION",
      "Full-stack Web3 development environment",
    ),
    tags: getValue("TEMPLATE_TAGS", "").split(";").filter(Boolean),
    cores: getNumber("TEMPLATE_CPU", 4),
    memory: getNumber("TEMPLATE_RAM", 8192),
    swap: getNumber("TEMPLATE_RAM", 8192), // Use same as RAM as default
    diskSize: getNumber("TEMPLATE_DISK", 20),
    osTemplate: getValue("TEMPLATE_OS", "debian"),
    osVersion: getValue("TEMPLATE_VERSION", "12"),
    unprivileged: getBoolean("TEMPLATE_UNPRIVILEGED", true),
    nesting: getBoolean("TEMPLATE_NESTING", true),
    keyctl: getBoolean("TEMPLATE_KEYCTL", true),
    fuse: getBoolean("TEMPLATE_FUSE", true),
  };
}

function parseScripts() {
  const scriptsPath = join(CONFIGS_PATH, "scripts");
  const files = readdirSync(scriptsPath)
    .filter((f) => f.endsWith(".sh") && f !== "README.md")
    .sort();

  return files.map((filename) => {
    const content = readFileSync(join(scriptsPath, filename), "utf-8");

    // Extract description from comment header
    const descMatch = content.match(/^#\s*(.+)$/m);
    const description = descMatch ? descMatch[1].trim() : undefined;

    // Extract order from filename prefix (e.g., "00-" -> 0)
    const orderMatch = filename.match(/^(\d+)-/);
    const order = orderMatch ? parseInt(orderMatch[1], 10) : 99;

    return {
      name: filename,
      order,
      content,
      description,
      enabled: true,
    };
  });
}

function parseFiles() {
  const filesPath = join(CONFIGS_PATH, "files");
  const allFiles = readdirSync(filesPath);

  // Get all config files (exclude .path, .policy, and README)
  const configFiles = allFiles.filter(
    (f) =>
      !f.endsWith(".path") &&
      !f.endsWith(".policy") &&
      f !== "README.md" &&
      f !== ".gitkeep",
  );

  return configFiles.map((filename) => {
    const content = readFileSync(join(filesPath, filename), "utf-8");

    // Read .path file if it exists
    const pathFile = join(filesPath, `${filename}.path`);
    const targetPath = existsSync(pathFile)
      ? readFileSync(pathFile, "utf-8").trim()
      : `/etc/${filename}`;

    // Read .policy file if it exists
    const policyFile = join(filesPath, `${filename}.policy`);
    let policy: "replace" | "default" | "backup" = "replace";
    if (existsSync(policyFile)) {
      const policyValue = readFileSync(policyFile, "utf-8").trim();
      if (
        policyValue === "replace" ||
        policyValue === "default" ||
        policyValue === "backup"
      ) {
        policy = policyValue;
      }
    }

    return {
      name: filename,
      targetPath,
      policy,
      content,
    };
  });
}

function parsePackages() {
  const packagesPath = join(CONFIGS_PATH, "packages");
  const packageFiles = readdirSync(packagesPath).filter(
    (f) => f.endsWith(".apt") || f.endsWith(".npm") || f.endsWith(".pip"),
  );

  const buckets: Record<
    string,
    {
      name: string;
      description: string;
      packages: { name: string; manager: string }[];
    }
  > = {};

  for (const filename of packageFiles) {
    const content = readFileSync(join(packagesPath, filename), "utf-8");
    const [bucketName, ext] = filename.split(".");

    // Determine package manager from extension
    let manager: "apt" | "npm" | "pip" = "apt";
    if (ext === "npm") manager = "npm";
    else if (ext === "pip") manager = "pip";

    // Parse package names (one per line, skip empty lines and comments)
    const packages = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((name) => ({ name, manager }));

    if (!buckets[bucketName]) {
      buckets[bucketName] = {
        name: bucketName,
        description: `${bucketName.charAt(0).toUpperCase()}${bucketName.slice(1)} packages for Web3 development`,
        packages: [],
      };
    }

    buckets[bucketName].packages.push(...packages);
  }

  return Object.values(buckets);
}

async function main() {
  console.log("🌱 Seeding database...");

  // Parse template configuration
  console.log("\n📄 Parsing template configuration...");
  const config = parseTemplateConfig();
  console.log(`  ✓ Template: ${config.name}`);

  // Parse scripts
  console.log("\n📜 Parsing scripts...");
  const scripts = parseScripts();
  console.log(`  ✓ Found ${scripts.length} scripts`);

  // Parse files
  console.log("\n📁 Parsing config files...");
  const files = parseFiles();
  console.log(`  ✓ Found ${files.length} config files`);

  // Parse packages
  console.log("\n📦 Parsing packages...");
  const packageBuckets = parsePackages();
  const totalPackages = packageBuckets.reduce(
    (sum, b) => sum + b.packages.length,
    0,
  );
  console.log(
    `  ✓ Found ${packageBuckets.length} package buckets with ${totalPackages} packages`,
  );

  // Create template with all related data in a transaction
  console.log("\n💾 Creating database records...");

  const template = await prisma.template.create({
    data: {
      name: config.name,
      description: config.description,
      source: "filesystem",
      path: TEMPLATE_PATH,
      osTemplate: `${config.osTemplate}-${config.osVersion}-standard`,
      cores: config.cores,
      memory: config.memory,
      swap: config.swap,
      diskSize: config.diskSize,
      storage: "local-lvm",
      bridge: "vmbr0",
      unprivileged: config.unprivileged,
      nesting: config.nesting,
      keyctl: config.keyctl,
      fuse: config.fuse,
      tags: config.tags.join(","),

      // Create related scripts
      scripts: {
        create: scripts,
      },

      // Create related files
      files: {
        create: files,
      },
    },
    include: {
      scripts: true,
      files: true,
    },
  });

  console.log(`  ✓ Created template: ${template.name} (${template.id})`);
  console.log(`    - ${template.scripts.length} scripts`);
  console.log(`    - ${template.files.length} files`);

  // Create package buckets and packages
  for (const bucket of packageBuckets) {
    const createdBucket = await prisma.packageBucket.create({
      data: {
        name: `${config.name} - ${bucket.name}`,
        description: bucket.description,
        packages: {
          create: bucket.packages.map((pkg) => ({
            name: pkg.name,
            manager: pkg.manager,
            templateId: template.id,
          })),
        },
      },
      include: {
        packages: true,
      },
    });

    console.log(
      `  ✓ Created package bucket: ${createdBucket.name} (${createdBucket.packages.length} packages)`,
    );
  }

  console.log("\n✅ Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
