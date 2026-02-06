"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import type { BucketWithPackages } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  createBucketAction,
  updateBucketAction,
  type ActionState,
} from "@/lib/packages/actions";

const initialState: ActionState = { success: false };

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
  const action = mode === "create" ? createBucketAction : updateBucketAction;
  const [state, formAction, pending] = useActionState(action, initialState);

  // Close dialog and show toast on success
  useEffect(() => {
    if (state.success) {
      setOpen(false);
      toast.success(mode === "create" ? "Bucket created" : "Bucket updated");
    }
  }, [state, mode]);

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
        <form action={formAction} className="space-y-4">
          {mode === "edit" && bucket && (
            <input type="hidden" name="id" value={bucket.id} />
          )}
          <div className="space-y-2">
            <Label htmlFor="bucket-name">Name</Label>
            <Input
              id="bucket-name"
              name="name"
              placeholder="e.g. base, development, monitoring"
              defaultValue={bucket?.name ?? ""}
              required
              maxLength={50}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bucket-description">Description</Label>
            <Textarea
              id="bucket-description"
              name="description"
              placeholder="Optional description of this package group"
              defaultValue={bucket?.description ?? ""}
              maxLength={200}
              className="min-h-16"
            />
          </div>
          {!state.success && state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending
                ? mode === "create"
                  ? "Creating..."
                  : "Saving..."
                : mode === "create"
                  ? "Create Bucket"
                  : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
