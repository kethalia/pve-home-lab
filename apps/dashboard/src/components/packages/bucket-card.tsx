"use client";

import { useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { BucketWithPackages } from "@/lib/db";
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
import { deleteBucketAction } from "@/lib/packages/actions";
import { BucketFormDialog } from "./bucket-form-dialog";
import { PackageList } from "./package-list";

export function BucketCard({ bucket }: { bucket: BucketWithPackages }) {
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    if (!confirm(`Delete bucket "${bucket.name}"? This cannot be undone.`)) {
      return;
    }

    startTransition(async () => {
      const result = await deleteBucketAction(bucket.id);
      if (result.success) {
        toast.success("Bucket deleted");
      } else {
        toast.error(result.error ?? "Failed to delete bucket");
      }
    });
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
        <Button
          variant="outline"
          size="sm"
          onClick={handleDelete}
          disabled={isPending}
        >
          <Trash2 className="size-3.5" />
          Delete
        </Button>
      </CardFooter>
    </Card>
  );
}
