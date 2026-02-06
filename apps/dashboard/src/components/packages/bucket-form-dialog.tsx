"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";

import type { BucketWithPackages } from "@/lib/db";
import { bucketSchema, type BucketFormValues } from "@/lib/packages/schemas";
import { createBucketAction, updateBucketAction } from "@/lib/packages/actions";
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

  const form = useForm<BucketFormValues>({
    resolver: zodResolver(bucketSchema),
    defaultValues: {
      name: bucket?.name ?? "",
      description: bucket?.description ?? "",
    },
  });

  const { execute: executeCreate, isPending: isCreating } = useAction(
    createBucketAction,
    {
      onSuccess: () => {
        setOpen(false);
        form.reset();
        toast.success("Bucket created");
      },
      onError: ({ error }) => {
        form.setError("name", {
          message: error.serverError ?? "An error occurred",
        });
      },
    },
  );

  const { execute: executeUpdate, isPending: isUpdating } = useAction(
    updateBucketAction,
    {
      onSuccess: () => {
        setOpen(false);
        form.reset();
        toast.success("Bucket updated");
      },
      onError: ({ error }) => {
        form.setError("name", {
          message: error.serverError ?? "An error occurred",
        });
      },
    },
  );

  const isPending = isCreating || isUpdating;

  const onSubmit = (values: BucketFormValues) => {
    if (mode === "create") {
      executeCreate(values);
    } else if (bucket) {
      executeUpdate({ id: bucket.id, ...values });
    }
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
