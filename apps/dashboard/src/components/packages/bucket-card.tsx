"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";

import type { BucketWithPackages } from "@/lib/db";
import { deleteBucketAction } from "@/lib/packages/actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { BucketFormDialog } from "./bucket-form-dialog";
import { PackageList } from "./package-list";

export function BucketCard({ bucket }: { bucket: BucketWithPackages }) {
  const { execute, isPending } = useAction(deleteBucketAction, {
    onSuccess: () => {
      toast.success("Bucket deleted");
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? "Failed to delete bucket");
    },
  });

  const handleDelete = () => {
    execute({ id: bucket.id });
  };

  return (
    <Card className={isPending ? "opacity-50" : ""}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">{bucket.name}</CardTitle>
            {bucket.description && (
              <CardDescription>{bucket.description}</CardDescription>
            )}
          </div>
          <Badge variant="outline">
            {bucket.packages.length} package
            {bucket.packages.length !== 1 ? "s" : ""}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <PackageList bucketId={bucket.id} packages={bucket.packages} />
      </CardContent>
      <CardFooter className="gap-2">
        <BucketFormDialog
          mode="edit"
          bucket={bucket}
          trigger={
            <Button variant="outline" size="sm">
              <Pencil className="size-3.5" />
              Edit
            </Button>
          }
        />
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={isPending}>
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete bucket</AlertDialogTitle>
              <AlertDialogDescription>
                Delete bucket &ldquo;{bucket.name}&rdquo;
                {bucket.packages.length > 0
                  ? ` and its ${bucket.packages.length} package${bucket.packages.length !== 1 ? "s" : ""}`
                  : ""}
                ? This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardFooter>
    </Card>
  );
}
