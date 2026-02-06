"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAction } from "next-safe-action/hooks";
import { X, Plus, Upload } from "lucide-react";
import { toast } from "sonner";

import type { Package, PackageManager } from "@/generated/prisma/client";
import {
  packageSchema,
  bulkImportFormSchema,
  type PackageFormValues,
  type BulkImportFormValues,
} from "@/lib/packages/schemas";
import {
  addPackageAction,
  removePackageAction,
  bulkImportAction,
} from "@/lib/packages/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ============================================================================
// PackageList
// ============================================================================

export function PackageList({
  bucketId,
  packages,
}: {
  bucketId: string;
  packages: Package[];
  manager?: PackageManager;
}) {
  const [showBulkImport, setShowBulkImport] = useState(false);

  // Add package form
  const addForm = useForm<PackageFormValues>({
    resolver: zodResolver(packageSchema),
    defaultValues: { name: "", manager: "apt" },
  });

  const { execute: executeAdd, isPending: addPending } = useAction(
    addPackageAction,
    {
      onSuccess: ({ data }) => {
        toast.success(data?.message ?? "Package added");
        addForm.reset();
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? "Failed to add package");
      },
    },
  );

  const onAddPackage = (values: PackageFormValues) => {
    executeAdd({ bucketId, ...values });
  };

  // Bulk import form
  const bulkForm = useForm<BulkImportFormValues>({
    resolver: zodResolver(bulkImportFormSchema),
    defaultValues: { content: "", manager: "apt" },
  });

  const { execute: executeBulk, isPending: bulkPending } = useAction(
    bulkImportAction,
    {
      onSuccess: ({ data }) => {
        toast.success(data?.message ?? "Packages imported");
        bulkForm.reset();
        setShowBulkImport(false);
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? "Failed to import packages");
      },
    },
  );

  const onBulkImport = (values: BulkImportFormValues) => {
    executeBulk({ bucketId, ...values });
  };

  return (
    <div className="space-y-3">
      {/* Package badges */}
      {packages.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {packages.map((pkg) => (
            <PackageBadge key={pkg.id} pkg={pkg} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No packages yet</p>
      )}

      {/* Add package inline form */}
      <Form {...addForm}>
        <form
          onSubmit={addForm.handleSubmit(onAddPackage)}
          className="flex items-center gap-2"
        >
          <FormField
            control={addForm.control}
            name="name"
            render={({ field }) => (
              <FormItem className="flex-1 space-y-0">
                <FormControl>
                  <Input
                    placeholder="Package name"
                    className="h-7 text-xs"
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={addForm.control}
            name="manager"
            render={({ field }) => (
              <FormItem className="space-y-0">
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="h-7 w-20 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="apt">apt</SelectItem>
                    <SelectItem value="npm">npm</SelectItem>
                    <SelectItem value="pip">pip</SelectItem>
                    <SelectItem value="custom">custom</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
          <Button
            type="submit"
            size="icon-xs"
            variant="outline"
            disabled={addPending}
          >
            <Plus className="size-3" />
          </Button>
        </form>
      </Form>

      {/* Bulk import toggle */}
      <Button
        type="button"
        variant="ghost"
        size="xs"
        onClick={() => setShowBulkImport(!showBulkImport)}
        className="text-xs"
      >
        <Upload className="size-3" />
        Bulk Import
      </Button>

      {/* Bulk import form */}
      {showBulkImport && (
        <Form {...bulkForm}>
          <form
            onSubmit={bulkForm.handleSubmit(onBulkImport)}
            className="space-y-2 rounded-md border p-3"
          >
            <FormField
              control={bulkForm.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">
                    Paste package list (one per line, # for comments)
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={`# Example .apt file\ncurl\nwget\ngit`}
                      className="min-h-20 text-xs font-mono"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex items-center gap-2">
              <FormField
                control={bulkForm.control}
                name="manager"
                render={({ field }) => (
                  <FormItem className="space-y-0">
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="h-7 w-24 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="apt">apt</SelectItem>
                        <SelectItem value="npm">npm</SelectItem>
                        <SelectItem value="pip">pip</SelectItem>
                        <SelectItem value="custom">custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <Button type="submit" size="xs" disabled={bulkPending}>
                Import
              </Button>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() => setShowBulkImport(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Form>
      )}
    </div>
  );
}

// ============================================================================
// PackageBadge
// ============================================================================

function PackageBadge({ pkg }: { pkg: Package }) {
  const { execute, isPending } = useAction(removePackageAction, {
    onSuccess: () => {
      toast.success("Package removed");
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? "Failed to remove package");
    },
  });

  return (
    <Badge
      variant="secondary"
      className={`gap-1 pr-1 ${isPending ? "opacity-50" : ""}`}
    >
      <span className="text-xs">{pkg.name}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={() => execute({ id: pkg.id })}
        disabled={isPending}
        className="size-4 rounded-full"
      >
        <X className="size-2.5" />
      </Button>
    </Badge>
  );
}
