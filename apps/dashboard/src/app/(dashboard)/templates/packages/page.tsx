import { Package2 } from "lucide-react";

import { DatabaseService } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { BucketCard } from "@/components/packages/bucket-card";
import { BucketFormDialog } from "@/components/packages/bucket-form-dialog";

export const dynamic = "force-dynamic";

export default async function PackagesPage() {
  const buckets = await DatabaseService.listBuckets();

  return (
    <div className="flex flex-1 flex-col gap-6">
      {/* Page header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Package Buckets</h1>
          <p className="text-muted-foreground">
            Manage reusable groups of packages for your templates
          </p>
        </div>
        <div className="mt-2 sm:mt-0">
          <BucketFormDialog
            mode="create"
            trigger={
              <Button>
                <Package2 className="size-4" />
                Create Bucket
              </Button>
            }
          />
        </div>
      </div>

      {/* Content */}
      {buckets.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <Package2 className="size-12 text-muted-foreground/50" />
          <div>
            <p className="text-lg font-medium">No package buckets yet</p>
            <p className="text-sm text-muted-foreground">
              Create one or run template discovery to auto-discover packages.
            </p>
          </div>
          <BucketFormDialog
            mode="create"
            trigger={
              <Button>
                <Package2 className="size-4" />
                Create Bucket
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {buckets.map((bucket) => (
            <BucketCard key={bucket.id} bucket={bucket} />
          ))}
        </div>
      )}
    </div>
  );
}
