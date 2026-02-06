"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import type { BucketWithPackages } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createBucketAction, updateBucketAction } from "@/lib/packages/actions";

const bucketSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(50, "Name must be 50 characters or less"),
  description: z
    .string()
    .max(200, "Description must be 200 characters or less")
    .optional()
    .or(z.literal("")),
});

type BucketFormValues = z.infer<typeof bucketSchema>;

export function BucketFormDialog({
  mode,
  bucket,
  trigger,
}: {
  mode: "create" | "edit";
  bucket?: BucketWithPackages;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const form = useForm<BucketFormValues>({
    resolver: zodResolver(bucketSchema),
    defaultValues: {
      name: bucket?.name ?? "",
      description: bucket?.description ?? "",
    },
  });

  const onSubmit = (values: BucketFormValues) => {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("name", values.name);
      formData.set("description", values.description ?? "");
      if (mode === "edit" && bucket) {
        formData.set("id", bucket.id);
      }

      const action =
        mode === "create" ? createBucketAction : updateBucketAction;
      const result = await action({ success: false }, formData);
      if (result.success) {
        setOpen(false);
        form.reset();
        toast.success(mode === "create" ? "Bucket created" : "Bucket updated");
        router.refresh();
      } else {
        form.setError("name", { message: result.error ?? "An error occurred" });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Create Package Bucket" : "Edit Bucket"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Create a reusable group of packages for your templates."
              : "Update the bucket name and description."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. base, development, monitoring"
                      maxLength={50}
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
                      placeholder="Optional description of this package group"
                      maxLength={200}
                      className="min-h-16"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending
                  ? mode === "create"
                    ? "Creating..."
                    : "Saving..."
                  : mode === "create"
                    ? "Create Bucket"
                    : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
