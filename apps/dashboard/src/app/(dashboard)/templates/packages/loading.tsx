import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";

export default function PackagesLoading() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      {/* Header skeleton */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-5 w-80" />
        </div>
        <Skeleton className="h-9 w-36 mt-2 sm:mt-0" />
      </div>

      {/* Card grid skeleton */}
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-28" />
                  <Skeleton className="h-4 w-48" />
                </div>
                <Skeleton className="h-5 w-20" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: 5 }).map((_, j) => (
                  <Skeleton key={j} className="h-5 w-16 rounded-md" />
                ))}
              </div>
            </CardContent>
            <CardFooter className="gap-2">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-8 w-16" />
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
