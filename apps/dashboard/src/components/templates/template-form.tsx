"use client";

/**
 * Template Form — Shared multi-section form for template create and edit.
 *
 * Sections: Basics, Resources, Features, Scripts, Packages, Files.
 * Uses useActionState for form submission with server actions.
 * Complex fields (scripts, files, bucketIds) are serialized as hidden JSON fields.
 */

import { useActionState, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import type { TemplateWithDetails, BucketWithPackages } from "@/lib/db";
import type { ActionState } from "@/lib/templates/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ScriptEditor,
  type ScriptInput,
} from "@/components/templates/script-editor";
import { FileEditor, type FileInput } from "@/components/templates/file-editor";

// ============================================================================
// Types
// ============================================================================

interface TemplateFormProps {
  mode: "create" | "edit";
  template?: TemplateWithDetails;
  buckets: BucketWithPackages[];
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
}

// ============================================================================
// Component
// ============================================================================

export function TemplateForm({
  mode,
  template,
  buckets,
  action,
}: TemplateFormProps) {
  const [state, formAction, isPending] = useActionState(action, {
    success: false,
  });

  // ----- Complex state (scripts, files, selected buckets) -----

  const [scripts, setScripts] = useState<ScriptInput[]>(
    template?.scripts.map((s) => ({
      name: s.name,
      order: s.order,
      content: s.content,
      description: s.description ?? "",
      enabled: s.enabled,
    })) ?? [],
  );

  const [files, setFiles] = useState<FileInput[]>(
    template?.files.map((f) => ({
      name: f.name,
      targetPath: f.targetPath,
      policy: f.policy as "replace" | "default" | "backup",
      content: f.content,
    })) ?? [],
  );

  // Determine which buckets are "selected" for edit mode by checking
  // if the template's packages overlap with bucket packages
  const [selectedBucketIds, setSelectedBucketIds] = useState<string[]>(() => {
    if (!template) return [];
    const templatePkgNames = new Set(template.packages.map((p) => p.name));
    return buckets
      .filter((b) => b.packages.some((p) => templatePkgNames.has(p.name)))
      .map((b) => b.id);
  });

  // ----- Feature toggles -----

  const [unprivileged, setUnprivileged] = useState(
    template?.unprivileged ?? true,
  );
  const [nesting, setNesting] = useState(template?.nesting ?? false);
  const [keyctl, setKeyctl] = useState(template?.keyctl ?? false);
  const [fuse, setFuse] = useState(template?.fuse ?? false);

  // ----- Helpers -----

  const toggleBucket = (bucketId: string) => {
    setSelectedBucketIds((prev) =>
      prev.includes(bucketId)
        ? prev.filter((id) => id !== bucketId)
        : [...prev, bucketId],
    );
  };

  // Collect all packages from selected buckets for preview
  const selectedPackages = buckets
    .filter((b) => selectedBucketIds.includes(b.id))
    .flatMap((b) => b.packages);

  return (
    <form action={formAction} className="space-y-6">
      {/* Hidden fields for complex data serialization */}
      <input type="hidden" name="scripts" value={JSON.stringify(scripts)} />
      <input type="hidden" name="files" value={JSON.stringify(files)} />
      <input
        type="hidden"
        name="bucketIds"
        value={selectedBucketIds.join(",")}
      />
      <input type="hidden" name="unprivileged" value={String(unprivileged)} />
      <input type="hidden" name="nesting" value={String(nesting)} />
      <input type="hidden" name="keyctl" value={String(keyctl)} />
      <input type="hidden" name="fuse" value={String(fuse)} />
      {mode === "edit" && template && (
        <input type="hidden" name="id" value={template.id} />
      )}

      {/* Error display */}
      {state.error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      {/* ================================================================== */}
      {/* Section 1: Basics */}
      {/* ================================================================== */}
      <Card>
        <CardHeader>
          <CardTitle>Basics</CardTitle>
          <CardDescription>
            Template name, description, and categorization
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              name="name"
              required
              maxLength={100}
              defaultValue={template?.name ?? ""}
              placeholder="e.g., Docker Development Server"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              maxLength={500}
              defaultValue={template?.description ?? ""}
              placeholder="What this template sets up..."
              rows={3}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tags">Tags</Label>
              <Input
                id="tags"
                name="tags"
                defaultValue={template?.tags ?? ""}
                placeholder="docker;development;web (semicolon-separated)"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="osTemplate">OS Template</Label>
              <Input
                id="osTemplate"
                name="osTemplate"
                defaultValue={template?.osTemplate ?? ""}
                placeholder="e.g., debian-12-standard"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ================================================================== */}
      {/* Section 2: Resources */}
      {/* ================================================================== */}
      <Card>
        <CardHeader>
          <CardTitle>Resources</CardTitle>
          <CardDescription>
            CPU, memory, disk, and network configuration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="cores">CPU Cores</Label>
              <Input
                id="cores"
                name="cores"
                type="number"
                min={1}
                max={64}
                defaultValue={template?.cores ?? ""}
                placeholder="4"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="memory">Memory (MB)</Label>
              <Input
                id="memory"
                name="memory"
                type="number"
                min={128}
                max={131072}
                defaultValue={template?.memory ?? ""}
                placeholder="8192"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="swap">Swap (MB)</Label>
              <Input
                id="swap"
                name="swap"
                type="number"
                min={0}
                max={131072}
                defaultValue={template?.swap ?? ""}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="diskSize">Disk Size (GB)</Label>
              <Input
                id="diskSize"
                name="diskSize"
                type="number"
                min={1}
                max={10000}
                defaultValue={template?.diskSize ?? ""}
                placeholder="20"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="storage">Storage</Label>
              <Input
                id="storage"
                name="storage"
                defaultValue={template?.storage ?? ""}
                placeholder="local-lvm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bridge">Bridge</Label>
              <Input
                id="bridge"
                name="bridge"
                defaultValue={template?.bridge ?? ""}
                placeholder="vmbr0"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ================================================================== */}
      {/* Section 3: Features */}
      {/* ================================================================== */}
      <Card>
        <CardHeader>
          <CardTitle>Features</CardTitle>
          <CardDescription>
            Container security and capability flags
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-6">
            <div className="flex items-center gap-2">
              <Switch
                id="unprivileged"
                checked={unprivileged}
                onCheckedChange={setUnprivileged}
              />
              <Label htmlFor="unprivileged">Unprivileged</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="nesting"
                checked={nesting}
                onCheckedChange={setNesting}
              />
              <Label htmlFor="nesting">Nesting</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="keyctl"
                checked={keyctl}
                onCheckedChange={setKeyctl}
              />
              <Label htmlFor="keyctl">Keyctl</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="fuse" checked={fuse} onCheckedChange={setFuse} />
              <Label htmlFor="fuse">FUSE</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ================================================================== */}
      {/* Section 4: Scripts */}
      {/* ================================================================== */}
      <Card>
        <CardHeader>
          <CardTitle>Scripts</CardTitle>
          <CardDescription>
            Setup scripts that run during container provisioning (in order)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScriptEditor scripts={scripts} onChange={setScripts} />
        </CardContent>
      </Card>

      {/* ================================================================== */}
      {/* Section 5: Packages */}
      {/* ================================================================== */}
      <Card>
        <CardHeader>
          <CardTitle>Packages</CardTitle>
          <CardDescription>
            Select package buckets to include in this template
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {buckets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No package buckets available.{" "}
              <Link
                href="/templates/packages"
                className="text-primary underline underline-offset-4 hover:text-primary/80"
              >
                Create one first
              </Link>
              .
            </p>
          ) : (
            <div className="space-y-3">
              {buckets.map((bucket) => (
                <div
                  key={bucket.id}
                  className="flex items-start gap-3 rounded-lg border p-3"
                >
                  <Checkbox
                    id={`bucket-${bucket.id}`}
                    checked={selectedBucketIds.includes(bucket.id)}
                    onCheckedChange={() => toggleBucket(bucket.id)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 space-y-1">
                    <Label
                      htmlFor={`bucket-${bucket.id}`}
                      className="cursor-pointer font-medium"
                    >
                      {bucket.name}
                    </Label>
                    {bucket.description && (
                      <p className="text-xs text-muted-foreground">
                        {bucket.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {bucket.packages.length} package
                      {bucket.packages.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Package preview */}
          {selectedPackages.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Packages to be included ({selectedPackages.length})
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {selectedPackages.map((pkg) => (
                  <Badge key={pkg.id} variant="secondary" className="text-xs">
                    {pkg.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ================================================================== */}
      {/* Section 6: Files */}
      {/* ================================================================== */}
      <Card>
        <CardHeader>
          <CardTitle>Config Files</CardTitle>
          <CardDescription>
            Configuration files deployed to the container at target paths
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FileEditor files={files} onChange={setFiles} />
        </CardContent>
      </Card>

      {/* ================================================================== */}
      {/* Form Footer */}
      {/* ================================================================== */}
      <div className="flex items-center justify-end gap-3">
        <Button variant="outline" asChild>
          <Link href="/templates">Cancel</Link>
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="size-4 animate-spin" />}
          {isPending
            ? mode === "create"
              ? "Creating..."
              : "Saving..."
            : mode === "create"
              ? "Create Template"
              : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
