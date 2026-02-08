"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

import type { PackageSelection } from "@/lib/containers/schemas";

interface PackagesStepProps {
  data: PackageSelection | null;
  templatePackages: Array<{ id: string; name: string; manager: string }>;
  onNext: (data: PackageSelection) => void;
  onBack: () => void;
}

interface BucketGroup {
  manager: string;
  packages: Array<{ id: string; name: string }>;
}

export function PackagesStep({
  data,
  templatePackages,
  onNext,
  onBack,
}: PackagesStepProps) {
  // Group packages by manager as "buckets"
  const bucketGroups = groupByManager(templatePackages);

  const [enabledBuckets, setEnabledBuckets] = useState<string[]>(
    data?.enabledBuckets ?? bucketGroups.map((b) => b.manager), // All enabled by default
  );
  const [additionalPackages, setAdditionalPackages] = useState(
    data?.additionalPackages ?? "",
  );
  const [expandedBuckets, setExpandedBuckets] = useState<string[]>([]);

  function toggleBucket(manager: string) {
    setEnabledBuckets((prev) =>
      prev.includes(manager)
        ? prev.filter((b) => b !== manager)
        : [...prev, manager],
    );
  }

  function toggleExpand(manager: string) {
    setExpandedBuckets((prev) =>
      prev.includes(manager)
        ? prev.filter((b) => b !== manager)
        : [...prev, manager],
    );
  }

  function handleNext() {
    onNext({
      enabledBuckets,
      additionalPackages: additionalPackages || undefined,
    });
  }

  const hasPackages = templatePackages.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Packages</h2>
        <p className="text-sm text-muted-foreground">
          {hasPackages
            ? "Toggle package groups from the selected template and add custom packages."
            : "No template packages configured. You can add custom packages below."}
        </p>
      </div>

      {hasPackages && (
        <div className="space-y-3">
          {bucketGroups.map((group) => {
            const isEnabled = enabledBuckets.includes(group.manager);
            const isExpanded = expandedBuckets.includes(group.manager);

            return (
              <Card key={group.manager}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id={`bucket-${group.manager}`}
                        checked={isEnabled}
                        onCheckedChange={() => toggleBucket(group.manager)}
                      />
                      <CardTitle className="text-sm font-medium">
                        <label
                          htmlFor={`bucket-${group.manager}`}
                          className="cursor-pointer"
                        >
                          {group.manager.toUpperCase()} packages
                        </label>
                      </CardTitle>
                      <Badge variant="secondary" className="text-xs">
                        {group.packages.length} package
                        {group.packages.length !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleExpand(group.manager)}
                    >
                      {isExpanded ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronRight className="size-4" />
                      )}
                    </Button>
                  </div>
                </CardHeader>
                {isExpanded && (
                  <CardContent className="pt-0">
                    <div className="flex flex-wrap gap-1.5">
                      {group.packages.map((pkg) => (
                        <Badge
                          key={pkg.id}
                          variant={isEnabled ? "default" : "outline"}
                          className="text-xs"
                        >
                          {pkg.name}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Separator />

      <div className="space-y-2">
        <Label htmlFor="additional-packages">
          Additional Packages (optional)
        </Label>
        <Textarea
          id="additional-packages"
          placeholder={"htop\ncurl\nvim"}
          rows={4}
          value={additionalPackages}
          onChange={(e) => setAdditionalPackages(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          One package name per line. These will be installed via apt.
        </p>
      </div>

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={handleNext}>Next</Button>
      </div>
    </div>
  );
}

/** Group template packages by their package manager */
function groupByManager(
  packages: Array<{ id: string; name: string; manager: string }>,
): BucketGroup[] {
  const groups = new Map<string, Array<{ id: string; name: string }>>();

  for (const pkg of packages) {
    const existing = groups.get(pkg.manager) ?? [];
    existing.push({ id: pkg.id, name: pkg.name });
    groups.set(pkg.manager, existing);
  }

  return Array.from(groups.entries()).map(([manager, pkgs]) => ({
    manager,
    packages: pkgs,
  }));
}
