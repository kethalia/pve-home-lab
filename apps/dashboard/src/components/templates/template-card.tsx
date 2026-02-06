import Link from "next/link";

import type { TemplateWithCounts } from "@/lib/db";
import { formatMemory, parseTags } from "@/lib/utils/format";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

/**
 * TemplateCard — Displays a template summary in a card layout.
 * Server Component (no "use client") for the template grid.
 */
export function TemplateCard({ template }: { template: TemplateWithCounts }) {
  const tags = parseTags(template.tags);

  return (
    <Link
      href={`/templates/${template.id}`}
      className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
    >
      <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer relative">
        {/* Source badge */}
        <div className="absolute top-3 right-4">
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {template.source}
          </span>
        </div>

        <CardHeader className="pb-2">
          <CardTitle className="text-base pr-16">{template.name}</CardTitle>
          {template.description && (
            <CardDescription className="line-clamp-2 text-xs">
              {template.description}
            </CardDescription>
          )}
        </CardHeader>

        <CardContent className="flex flex-col gap-3">
          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Resource summary */}
          <div className="text-xs text-muted-foreground">
            {template.cores ?? "?"} cores &middot;{" "}
            {formatMemory(template.memory)} RAM &middot;{" "}
            {template.diskSize ?? "?"} GB disk
          </div>

          {/* Stats row */}
          <div className="text-xs text-muted-foreground border-t pt-2">
            {template._count.scripts} scripts &middot; {template._count.files}{" "}
            files &middot; {template._count.packages} packages
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
