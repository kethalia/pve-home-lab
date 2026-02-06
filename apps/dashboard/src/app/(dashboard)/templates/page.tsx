import Link from "next/link";
import { Plus, PackageOpen } from "lucide-react";

import { DatabaseService } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { TemplateCard } from "@/components/templates/template-card";
import { TemplateSearch } from "@/components/templates/template-search";
import { DiscoverButton } from "@/components/templates/discover-button";

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; tags?: string }>;
}) {
  const params = await searchParams;
  const search = params.search || undefined;
  const tags = params.tags?.split(",").filter(Boolean) || undefined;

  // Fetch data in parallel
  const [templates, allTags] = await Promise.all([
    DatabaseService.listTemplates({ search, tags }),
    DatabaseService.getTemplateTags(),
  ]);

  const hasFilters = !!search || (tags && tags.length > 0);

  return (
    <div className="flex flex-1 flex-col gap-6">
      {/* Page header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Templates</h1>
          <p className="text-muted-foreground">
            Browse and manage LXC container templates
          </p>
        </div>
        <div className="flex items-center gap-2 mt-2 sm:mt-0">
          <DiscoverButton />
          <Button asChild>
            <Link href="/templates/new">
              <Plus className="size-4" />
              Create Template
            </Link>
          </Button>
        </div>
      </div>

      {/* Search and filters */}
      <TemplateSearch tags={allTags} />

      {/* Content */}
      {templates.length === 0 ? (
        hasFilters ? (
          /* No results state */
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <PackageOpen className="size-12 text-muted-foreground/50" />
            <div>
              <p className="text-lg font-medium">
                No templates match your search
              </p>
              <p className="text-sm text-muted-foreground">
                Try adjusting your search terms or clearing filters.
              </p>
            </div>
          </div>
        ) : (
          /* Empty state */
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <PackageOpen className="size-12 text-muted-foreground/50" />
            <div>
              <p className="text-lg font-medium">No templates discovered yet</p>
              <p className="text-sm text-muted-foreground">
                Click &quot;Discover Templates&quot; to scan your filesystem for
                available LXC templates.
              </p>
            </div>
            <DiscoverButton />
          </div>
        )
      ) : (
        /* Template grid */
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <TemplateCard key={template.id} template={template} />
          ))}
        </div>
      )}
    </div>
  );
}
