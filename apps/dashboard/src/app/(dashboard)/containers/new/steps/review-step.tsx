"use client";

import { Loader2, Rocket } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

import type { ContainerConfig } from "@/lib/containers/schemas";
import type { PackageSelection } from "@/lib/containers/schemas";
import type { ScriptConfig } from "@/lib/containers/schemas";
interface ReviewStepProps {
  templateName: string | null;
  config: ContainerConfig | null;
  packages: PackageSelection | null;
  scripts: ScriptConfig | null;
  templatePackages: Array<{ id: string; name: string; manager: string }>;
  isPending: boolean;
  onDeploy: () => void;
  onBack: () => void;
}

// TODO: Save as Template button — deferred to future enhancement

export function ReviewStep({
  templateName,
  config,
  packages,
  scripts,
  templatePackages,
  isPending,
  onDeploy,
  onBack,
}: ReviewStepProps) {
  if (!config) {
    return (
      <div className="text-center text-muted-foreground py-8">
        No configuration data available. Please go back and complete the
        previous steps.
      </div>
    );
  }

  // Count enabled packages by manager
  const enabledPackages = packages?.enabledBuckets
    ? templatePackages.filter((p) =>
        packages.enabledBuckets.includes(p.manager),
      )
    : templatePackages;
  const packagesByManager = new Map<string, string[]>();
  for (const pkg of enabledPackages) {
    const existing = packagesByManager.get(pkg.manager) ?? [];
    existing.push(pkg.name);
    packagesByManager.set(pkg.manager, existing);
  }

  // Additional packages
  const additionalPkgs =
    packages?.additionalPackages
      ?.split("\n")
      .map((p) => p.trim())
      .filter(Boolean) ?? [];

  // Enabled scripts
  const enabledScripts = scripts?.scripts.filter((s) => s.enabled) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Review & Deploy</h2>
        <p className="text-sm text-muted-foreground">
          Review your container configuration before deploying.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Template */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Template</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-1">
            <p className="font-medium">{templateName ?? "From Scratch"}</p>
            <ReviewItem
              label="OS Template"
              value={config.ostemplate || "Not set"}
            />
          </CardContent>
        </Card>

        {/* Identity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Identity</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-1">
            <ReviewItem label="Target Node" value={config.targetNode} />
            <ReviewItem label="Hostname" value={config.hostname} />
            <ReviewItem label="VMID" value={String(config.vmid)} />
            {config.tags && <ReviewItem label="Tags" value={config.tags} />}
          </CardContent>
        </Card>

        {/* Resources */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Resources</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-1">
            <ReviewItem label="CPU Cores" value={String(config.cores)} />
            <ReviewItem label="Memory" value={`${config.memory} MB`} />
            <ReviewItem label="Swap" value={`${config.swap} MB`} />
            <ReviewItem label="Disk" value={`${config.diskSize} GB`} />
          </CardContent>
        </Card>

        {/* Network */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Storage & Network</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-1">
            <ReviewItem label="Storage" value={config.storage} />
            <ReviewItem label="Bridge" value={config.bridge} />
            <ReviewItem
              label="IP Config"
              value={
                config.dhcp
                  ? "DHCP"
                  : `${config.ip}${config.gateway ? ` / gw ${config.gateway}` : ""}`
              }
            />
            {config.nameserver && (
              <ReviewItem label="Nameserver" value={config.nameserver} />
            )}
          </CardContent>
        </Card>

        {/* Features */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Features</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-1">
            <ReviewItem
              label="Unprivileged"
              value={config.unprivileged ? "Yes" : "No"}
            />
            <ReviewItem label="Nesting" value={config.nesting ? "Yes" : "No"} />
            <ReviewItem
              label="SSH Key"
              value={config.sshPublicKey ? "Configured" : "None"}
            />
          </CardContent>
        </Card>

        {/* Packages */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Packages</CardTitle>
            <CardDescription className="text-xs">
              {enabledPackages.length + additionalPkgs.length} package
              {enabledPackages.length + additionalPkgs.length !== 1
                ? "s"
                : ""}{" "}
              selected
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {packagesByManager.size > 0 || additionalPkgs.length > 0 ? (
              <div className="space-y-2">
                {Array.from(packagesByManager.entries()).map(
                  ([manager, pkgs]) => (
                    <div key={manager}>
                      <span className="text-xs font-medium text-muted-foreground uppercase">
                        {manager}
                      </span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {pkgs.map((name) => (
                          <Badge
                            key={name}
                            variant="secondary"
                            className="text-xs"
                          >
                            {name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ),
                )}
                {additionalPkgs.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase">
                      Additional
                    </span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {additionalPkgs.map((name) => (
                        <Badge key={name} variant="outline" className="text-xs">
                          {name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">None</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Scripts */}
      {enabledScripts.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              Scripts ({enabledScripts.length} enabled)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ol className="list-decimal list-inside space-y-1">
              {enabledScripts.map((script) => (
                <li key={script.id} className="text-sm">
                  {script.name}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Deploy Actions */}
      <div className="flex justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          disabled={isPending}
        >
          Back
        </Button>
        <Button onClick={onDeploy} disabled={isPending} size="lg">
          {isPending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Deploying...
            </>
          ) : (
            <>
              <Rocket className="mr-2 size-4" />
              Deploy Container
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
