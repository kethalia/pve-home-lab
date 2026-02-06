/**
 * Template Filesystem Parser
 *
 * Pure functions for parsing LXC template components from the filesystem.
 * No database dependencies — reads filesystem and returns typed data.
 */

import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

// =============================================================================
// Type Definitions
// =============================================================================

export interface ParsedTemplate {
  name: string; // directory name, e.g., "web3-dev"
  appName: string; // TEMPLATE_APP value
  description: string; // TEMPLATE_DESCRIPTION value
  tags: string[]; // TEMPLATE_TAGS split by ";"
  cores: number; // TEMPLATE_CPU
  memory: number; // TEMPLATE_RAM in MB
  diskSize: number; // TEMPLATE_DISK in GB
  osTemplate: string; // "${TEMPLATE_OS}-${TEMPLATE_VERSION}-standard"
  unprivileged: boolean; // TEMPLATE_UNPRIVILEGED === "1"
  nesting: boolean; // TEMPLATE_NESTING === "1"
  keyctl: boolean; // TEMPLATE_KEYCTL === "1"
  fuse: boolean; // TEMPLATE_FUSE === "1"
  path: string; // absolute path to template directory
}

export interface ParsedScript {
  name: string; // filename without numeric prefix, e.g., "pre-checks.sh"
  fullName: string; // full filename, e.g., "00-pre-checks.sh"
  order: number; // numeric prefix, e.g., 0, 1, 2...
  content: string; // full file content
}

export interface ParsedPackageBucket {
  name: string; // filename without extension, e.g., "base", "development"
  manager: "apt" | "npm" | "pip"; // determined by file extension
  packages: string[]; // individual package names (comments/blanks stripped)
}

export interface ParsedFile {
  name: string; // filename, e.g., "bashrc"
  targetPath: string; // from .path sidecar, e.g., "/home/coder"
  policy: string; // from .policy sidecar, e.g., "default"
  content: string; // file content
}

// =============================================================================
// Helper: Parse bash variable value
// =============================================================================

/**
 * Resolve a bash variable value, handling:
 * - Quoted strings (single and double quotes)
 * - ${VAR:-default} patterns (extracts the default value)
 */
function resolveBashValue(raw: string): string {
  // Strip surrounding quotes (single or double)
  let value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  // Handle ${VAR:-default} pattern — extract the default value.
  // Limitation: does not support nested expansions (${VAR:-${OTHER:-val}})
  // or escaped braces. Sufficient for template.conf which uses simple defaults.
  const defaultPattern = /^\$\{[A-Za-z_][A-Za-z0-9_]*:-([^}]*)\}$/;
  const match = value.match(defaultPattern);
  if (match) {
    return match[1];
  }

  return value;
}

// =============================================================================
// Parser Functions
// =============================================================================

/**
 * Parse a template.conf file into structured data.
 *
 * Reads bash-style variable assignments (KEY=VALUE or KEY="VALUE")
 * and maps TEMPLATE_* variables to ParsedTemplate fields.
 */
export async function parseTemplateConf(
  confPath: string,
): Promise<ParsedTemplate> {
  const content = await fs.readFile(confPath, "utf-8");
  const vars = new Map<string, string>();

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Match variable assignments: KEY=VALUE
    const assignMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (assignMatch) {
      const key = assignMatch[1];
      const rawValue = assignMatch[2];
      vars.set(key, resolveBashValue(rawValue));
    }
  }

  const templateDir = path.dirname(confPath);
  const name = path.basename(templateDir);

  const os = vars.get("TEMPLATE_OS") ?? "debian";
  const version = vars.get("TEMPLATE_VERSION") ?? "12";

  return {
    name,
    appName: vars.get("TEMPLATE_APP") ?? name,
    description: vars.get("TEMPLATE_DESCRIPTION") ?? "",
    tags: (vars.get("TEMPLATE_TAGS") ?? "")
      .split(";")
      .map((t) => t.trim())
      .filter(Boolean),
    cores: parseInt(vars.get("TEMPLATE_CPU") ?? "1", 10),
    memory: parseInt(vars.get("TEMPLATE_RAM") ?? "512", 10),
    diskSize: parseInt(vars.get("TEMPLATE_DISK") ?? "8", 10),
    osTemplate: `${os}-${version}-standard`,
    unprivileged: (vars.get("TEMPLATE_UNPRIVILEGED") ?? "1") === "1",
    nesting: (vars.get("TEMPLATE_NESTING") ?? "0") === "1",
    keyctl: (vars.get("TEMPLATE_KEYCTL") ?? "0") === "1",
    fuse: (vars.get("TEMPLATE_FUSE") ?? "0") === "1",
    path: path.resolve(templateDir),
  };
}

/**
 * Parse all shell scripts from a scripts directory.
 *
 * Reads *.sh files, extracts numeric prefix for ordering,
 * and returns sorted array with full file content.
 */
export async function parseScripts(
  scriptsDir: string,
): Promise<ParsedScript[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(scriptsDir);
  } catch {
    return [];
  }

  const scripts: ParsedScript[] = [];

  for (const entry of entries) {
    // Only process .sh files, exclude .gitkeep and README.md
    if (!entry.endsWith(".sh")) continue;
    if (entry === ".gitkeep") continue;

    // Extract numeric prefix: match "NN-rest.sh"
    const prefixMatch = entry.match(/^(\d+)-(.*)$/);
    if (!prefixMatch) continue;

    const order = parseInt(prefixMatch[1], 10);
    const nameWithoutPrefix = prefixMatch[2];
    const content = await fs.readFile(path.join(scriptsDir, entry), "utf-8");

    scripts.push({
      name: nameWithoutPrefix,
      fullName: entry,
      order,
      content,
    });
  }

  // Sort by numeric prefix ascending
  scripts.sort((a, b) => a.order - b.order);

  return scripts;
}

/**
 * Parse package files from a packages directory.
 *
 * Reads *.apt, *.npm, *.pip files into named buckets.
 * Strips comments and blank lines from package lists.
 */
export async function parsePackages(
  packagesDir: string,
): Promise<ParsedPackageBucket[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(packagesDir);
  } catch {
    return [];
  }

  const managerMap: Record<string, "apt" | "npm" | "pip"> = {
    ".apt": "apt",
    ".npm": "npm",
    ".pip": "pip",
  };

  const buckets: ParsedPackageBucket[] = [];

  for (const entry of entries) {
    // Skip .gitkeep and README.md
    if (entry === ".gitkeep" || entry === "README.md") continue;

    const ext = path.extname(entry);
    const manager = managerMap[ext];
    if (!manager) continue;

    const bucketName = path.basename(entry, ext);
    const content = await fs.readFile(path.join(packagesDir, entry), "utf-8");

    const packages = content
      .split("\n")
      .map((line) => line.trim())
      // Strip inline comments (e.g., "rsync  # Fast file sync" → "rsync")
      .map((line) => line.replace(/#.*$/, "").trim())
      .filter((line) => line.length > 0);

    buckets.push({
      name: bucketName,
      manager,
      packages,
    });
  }

  return buckets;
}

/**
 * Parse config files with their .path and .policy sidecars.
 *
 * For each file in the directory (excluding .gitkeep, README.md,
 * and sidecar files), reads the content plus its .path and .policy
 * companion files.
 */
export async function parseFiles(filesDir: string): Promise<ParsedFile[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(filesDir);
  } catch {
    return [];
  }

  // Filter out .gitkeep, README.md, and sidecar files (.path, .policy)
  const configFiles = entries.filter(
    (entry) =>
      entry !== ".gitkeep" &&
      entry !== "README.md" &&
      !entry.endsWith(".path") &&
      !entry.endsWith(".policy"),
  );

  const files: ParsedFile[] = [];

  for (const filename of configFiles) {
    const filePath = path.join(filesDir, filename);
    const pathSidecar = path.join(filesDir, `${filename}.path`);
    const policySidecar = path.join(filesDir, `${filename}.policy`);

    // Check sidecars exist
    let targetPath: string;
    let policy: string;
    try {
      targetPath = (await fs.readFile(pathSidecar, "utf-8")).trim();
    } catch {
      console.warn(
        `[template-parser] Missing .path sidecar for ${filename}, skipping`,
      );
      continue;
    }

    try {
      policy = (await fs.readFile(policySidecar, "utf-8")).trim();
    } catch {
      console.warn(
        `[template-parser] Missing .policy sidecar for ${filename}, skipping`,
      );
      continue;
    }

    const content = await fs.readFile(filePath, "utf-8");

    files.push({
      name: filename,
      targetPath,
      policy,
      content,
    });
  }

  return files;
}

/**
 * Discover template directories under a root directory.
 *
 * Returns full paths to subdirectories that contain a template.conf file.
 */
export async function discoverTemplateDirs(rootDir: string): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(rootDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const templateDirs: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const dirPath = path.join(rootDir, entry.name);
    const confPath = path.join(dirPath, "template.conf");

    try {
      await fs.access(confPath);
      templateDirs.push(dirPath);
    } catch {
      // No template.conf — skip
    }
  }

  return templateDirs;
}

/**
 * Parse a complete template directory — config, scripts, packages, and files.
 *
 * Orchestrates all individual parsers for a single template.
 * Missing subdirectories are handled gracefully (returns empty arrays).
 */
export async function parseFullTemplate(templateDir: string): Promise<{
  template: ParsedTemplate;
  scripts: ParsedScript[];
  packages: ParsedPackageBucket[];
  files: ParsedFile[];
}> {
  const confPath = path.join(templateDir, "template.conf");
  const scriptsDir = path.join(templateDir, "container-configs", "scripts");
  const packagesDir = path.join(templateDir, "container-configs", "packages");
  const filesDir = path.join(templateDir, "container-configs", "files");

  const [template, scripts, packages, files] = await Promise.all([
    parseTemplateConf(confPath),
    parseScripts(scriptsDir),
    parsePackages(packagesDir),
    parseFiles(filesDir),
  ]);

  return { template, scripts, packages, files };
}
