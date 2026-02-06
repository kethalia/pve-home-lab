/**
 * Shared package utilities.
 */

import type { Package } from "@/generated/prisma/client";

/** Display labels for package manager types. */
export const managerLabels: Record<string, string> = {
  apt: "APT",
  npm: "NPM",
  pip: "PIP",
  custom: "Custom",
};

/**
 * Group packages by their manager type.
 */
export function groupByManager(packages: Package[]): Record<string, Package[]> {
  const grouped: Record<string, Package[]> = {};
  for (const pkg of packages) {
    const key = pkg.manager;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(pkg);
  }
  return grouped;
}
