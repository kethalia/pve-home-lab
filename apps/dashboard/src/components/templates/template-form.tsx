"use client";

/**
 * Template Form — Shared multi-section form for template create and edit.
 *
 * Sections: Basics, Resources, Features, Scripts, Packages, Files.
 * Uses react-hook-form + shadcn Form for validation and field management.
 * Complex fields (scripts, files) are managed as controlled sub-components
 * with values synced into react-hook-form state.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAction } from "next-safe-action/hooks";
import { AlertCircle, Loader2 } from "lucide-react";

import type { TemplateWithDetails, BucketWithPackages } from "@/lib/db";
import {
  templateFormSchema,
  type TemplateFormValues,
  type TemplateFormInput,
} from "@/lib/templates/schemas";
import {
  createTemplateAction,
  updateTemplateAction,
} from "@/lib/templates/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ScriptEditor,
  createScriptInput,
  type ScriptInput,
} from "@/components/templates/script-editor";
import {
  FileEditor,
  createFileInput,
  type FileInput,
} from "@/components/templates/file-editor";

// ============================================================================
// Types
// ============================================================================

interface TemplateFormProps {
  mode: "create" | "edit";
  template?: TemplateWithDetails;
  buckets: BucketWithPackages[];
}

// ============================================================================
// Component
// ============================================================================

export function TemplateForm({ mode, template, buckets }: TemplateFormProps) {
  const router = useRouter();

  // ----- Form setup with react-hook-form + Zod -----

  const form = useForm<TemplateFormInput, unknown, TemplateFormValues>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: {
      name: template?.name ?? "",
      description: template?.description ?? "",
      osTemplate: template?.osTemplate ?? "",
      cores: template?.cores ?? null,
      memory: template?.memory ?? null,
      swap: template?.swap ?? null,
      diskSize: template?.diskSize ?? null,
      storage: template?.storage ?? "",
      bridge: template?.bridge ?? "",
      unprivileged: template?.unprivileged ?? true,
      nesting: template?.nesting ?? false,
      keyctl: template?.keyctl ?? false,
      fuse: template?.fuse ?? false,
      tags: template?.tags ?? "",
      scripts:
        template?.scripts.map((s) => ({
          name: s.name,
          order: s.order,
          content: s.content,
          description: s.description ?? "",
          enabled: s.enabled,
        })) ?? [],
      files:
        template?.files.map((f) => ({
          name: f.name,
          targetPath: f.targetPath,
          policy: f.policy as "replace" | "default" | "backup",
          content: f.content,
        })) ?? [],
      bucketIds: (() => {
        if (!template) return [];
        const templatePkgKeys = new Set(
          template.packages.map(
            (p) => `${p.manager}:${p.name}:${p.version ?? ""}`,
          ),
        );
        return buckets
          .filter((b) =>
            b.packages.some((p) =>
              templatePkgKeys.has(`${p.manager}:${p.name}:${p.version ?? ""}`),
            ),
          )
          .map((b) => b.id);
      })(),
    },
  });

  // ----- Safe actions for create/update -----

  const [serverError, setServerError] = useState<string | null>(null);

  const { execute: executeCreate, isPending: isCreating } = useAction(
    createTemplateAction,
    {
      onSuccess: ({ data }) => {
        if (data?.templateId) {
          router.push(`/templates/${data.templateId}`);
        }
      },
      onError: ({ error }) => {
        setServerError(error.serverError ?? "An error occurred");
      },
    },
  );

  const { execute: executeUpdate, isPending: isUpdating } = useAction(
    updateTemplateAction,
    {
      onSuccess: ({ data }) => {
        if (data?.templateId) {
          router.push(`/templates/${data.templateId}`);
        }
      },
      onError: ({ error }) => {
        setServerError(error.serverError ?? "An error occurred");
      },
    },
  );

  const isPending = isCreating || isUpdating;

  // ----- Complex sub-editor state (scripts, files) -----
  // ScriptEditor/FileEditor use _key for React keys, which isn't part
  // of the Zod schema. We manage them as local state and sync values
  // into react-hook-form on change.

  const [scripts, setScripts] = useState<ScriptInput[]>(
    template?.scripts.map((s) =>
      createScriptInput({
        name: s.name,
        order: s.order,
        content: s.content,
        description: s.description ?? "",
        enabled: s.enabled,
      }),
    ) ?? [],
  );

  const [files, setFiles] = useState<FileInput[]>(
    template?.files.map((f) =>
      createFileInput({
        name: f.name,
        targetPath: f.targetPath,
        policy: f.policy as "replace" | "default" | "backup",
        content: f.content,
      }),
    ) ?? [],
  );

  // Sync scripts/files into react-hook-form whenever they change
  useEffect(() => {
    form.setValue(
      "scripts",
      scripts.map(({ _key, ...s }) => s),
    );
  }, [scripts, form]);

  useEffect(() => {
    form.setValue(
      "files",
      files.map(({ _key, ...f }) => f),
    );
  }, [files, form]);

  // ----- Helpers -----

  const selectedBucketIds = form.watch("bucketIds") ?? [];

  const toggleBucket = (bucketId: string) => {
    const current = form.getValues("bucketIds") ?? [];
    const next = current.includes(bucketId)
      ? current.filter((id) => id !== bucketId)
      : [...current, bucketId];
    form.setValue("bucketIds", next);
  };

  const selectedPackages = buckets
    .filter((b) => selectedBucketIds.includes(b.id))
    .flatMap((b) => b.packages);

  // ----- Submit handler -----

  function onSubmit(values: TemplateFormValues) {
    setServerError(null);
    if (mode === "create") {
      executeCreate(values);
    } else if (template) {
      executeUpdate({ id: template.id, ...values });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Server error display */}
        {serverError && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        {/* ================================================================ */}
        {/* Section 1: Basics */}
        {/* ================================================================ */}
        <Card>
          <CardHeader>
            <CardTitle>Basics</CardTitle>
            <CardDescription>
              Template name, description, and categorization
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Name <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      maxLength={100}
                      placeholder="e.g., Docker Development Server"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      maxLength={500}
                      placeholder="What this template sets up..."
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="tags"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tags</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="docker;development;web (semicolon-separated)"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="osTemplate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>OS Template</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., debian-12-standard"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* ================================================================ */}
        {/* Section 2: Resources */}
        {/* ================================================================ */}
        <Card>
          <CardHeader>
            <CardTitle>Resources</CardTitle>
            <CardDescription>
              CPU, memory, disk, and network configuration
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <FormField
                control={form.control}
                name="cores"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CPU Cores</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={64}
                        placeholder="4"
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === ""
                              ? null
                              : parseInt(e.target.value),
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="memory"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Memory (MB)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={128}
                        max={131072}
                        placeholder="8192"
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === ""
                              ? null
                              : parseInt(e.target.value),
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="swap"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Swap (MB)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={131072}
                        placeholder="0"
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === ""
                              ? null
                              : parseInt(e.target.value),
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="diskSize"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Disk Size (GB)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={10000}
                        placeholder="20"
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === ""
                              ? null
                              : parseInt(e.target.value),
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="storage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Storage</FormLabel>
                    <FormControl>
                      <Input placeholder="local-lvm" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bridge"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bridge</FormLabel>
                    <FormControl>
                      <Input placeholder="vmbr0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* ================================================================ */}
        {/* Section 3: Features */}
        {/* ================================================================ */}
        <Card>
          <CardHeader>
            <CardTitle>Features</CardTitle>
            <CardDescription>
              Container security and capability flags
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-6">
              <FormField
                control={form.control}
                name="unprivileged"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel>Unprivileged</FormLabel>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="nesting"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel>Nesting</FormLabel>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="keyctl"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel>Keyctl</FormLabel>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="fuse"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel>FUSE</FormLabel>
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* ================================================================ */}
        {/* Section 4: Scripts */}
        {/* ================================================================ */}
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

        {/* ================================================================ */}
        {/* Section 5: Packages */}
        {/* ================================================================ */}
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

        {/* ================================================================ */}
        {/* Section 6: Files */}
        {/* ================================================================ */}
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

        {/* ================================================================ */}
        {/* Form Footer */}
        {/* ================================================================ */}
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
    </Form>
  );
}
