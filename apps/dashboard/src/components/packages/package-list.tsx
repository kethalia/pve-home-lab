"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { X, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import type { Package, PackageManager } from "@/generated/prisma/client";
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
import {
  addPackageAction,
  removePackageAction,
  bulkImportAction,
} from "@/lib/packages/actions";

// ============================================================================
// Schemas
// ============================================================================

const addPackageSchema = z.object({
  name: z.string().min(1, "Package name is required"),
  manager: z.enum(["apt", "npm", "pip", "custom"]),
});

const bulkImportSchema = z.object({
  content: z.string().min(1, "Paste package content to import"),
  manager: z.enum(["apt", "npm", "pip", "custom"]),
});

type AddPackageValues = z.infer<typeof addPackageSchema>;
type BulkImportValues = z.infer<typeof bulkImportSchema>;

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
  const [addPending, startAddTransition] = useTransition();
  const [bulkPending, startBulkTransition] = useTransition();
  const router = useRouter();

  // Add package form
  const addForm = useForm<AddPackageValues>({
    resolver: zodResolver(addPackageSchema),
    defaultValues: { name: "", manager: "apt" },
  });

  const onAddPackage = (values: AddPackageValues) => {
    startAddTransition(async () => {
      const formData = new FormData();
      formData.set("bucketId", bucketId);
      formData.set("name", values.name);
      formData.set("manager", values.manager);

      const result = await addPackageAction({ success: false }, formData);
      if (result.success && result.message) {
        toast.success(result.message);
        addForm.reset();
        router.refresh();
      } else if (!result.success && result.error) {
        toast.error(result.error);
      }
    });
  };

  // Bulk import form
  const bulkForm = useForm<BulkImportValues>({
    resolver: zodResolver(bulkImportSchema),
    defaultValues: { content: "", manager: "apt" },
  });

  const onBulkImport = (values: BulkImportValues) => {
    startBulkTransition(async () => {
      const formData = new FormData();
      formData.set("bucketId", bucketId);
      formData.set("content", values.content);
      formData.set("manager", values.manager);

      const result = await bulkImportAction({ success: false }, formData);
      if (result.success && result.message) {
        toast.success(result.message);
        bulkForm.reset();
        setShowBulkImport(false);
        router.refresh();
      } else if (!result.success && result.error) {
        toast.error(result.error);
      }
    });
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
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleRemove = () => {
    startTransition(async () => {
      const result = await removePackageAction(pkg.id);
      if (result.success) {
        toast.success("Package removed");
        router.refresh();
      } else {
        toast.error(result.error ?? "Failed to remove package");
      }
    });
  };

  return (
    <Badge
      variant="secondary"
      className={`gap-1 pr-1 ${isPending ? "opacity-50" : ""}`}
    >
      <span className="text-xs">{pkg.name}</span>
      <button
        type="button"
        onClick={handleRemove}
        disabled={isPending}
        className="rounded-full p-0.5 hover:bg-muted-foreground/20"
      >
        <X className="size-2.5" />
      </button>
    </Badge>
  );
}
