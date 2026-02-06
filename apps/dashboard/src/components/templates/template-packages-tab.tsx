import type { Package } from "@/generated/prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PackageOpen } from "lucide-react";

/**
 * Group packages by their manager type.
 */
function groupByManager(packages: Package[]): Record<string, Package[]> {
  const grouped: Record<string, Package[]> = {};
  for (const pkg of packages) {
    const key = pkg.manager;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(pkg);
  }
  return grouped;
}

/** Display label for package manager types */
const managerLabels: Record<string, string> = {
  apt: "APT",
  npm: "NPM",
  pip: "PIP",
  custom: "Custom",
};

/**
 * TemplatePackagesTab — Displays packages grouped by manager type.
 * Server Component (no "use client").
 */
export function TemplatePackagesTab({ packages }: { packages: Package[] }) {
  if (packages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <PackageOpen className="size-10 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">No packages configured</p>
      </div>
    );
  }

  const grouped = groupByManager(packages);
  const managerKeys = Object.keys(grouped).sort();

  return (
    <div className="grid gap-4">
      {managerKeys.map((manager) => (
        <Card key={manager}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {managerLabels[manager] ?? manager}
              <Badge variant="secondary" className="text-xs">
                {grouped[manager].length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {grouped[manager]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((pkg) => (
                  <Badge key={pkg.id} variant="outline">
                    {pkg.name}
                    {pkg.version && (
                      <span className="ml-1 text-muted-foreground">
                        @{pkg.version}
                      </span>
                    )}
                  </Badge>
                ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
