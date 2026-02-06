"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * Inner search component that uses useSearchParams.
 * Wrapped in Suspense by the exported TemplateSearch.
 */
function TemplateSearchInner({ tags }: { tags: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentSearch = searchParams.get("search") ?? "";
  const currentTags =
    searchParams.get("tags")?.split(",").filter(Boolean) ?? [];

  const [searchValue, setSearchValue] = useState(currentSearch);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync input with URL when search params change externally
  useEffect(() => {
    setSearchValue(currentSearch);
  }, [currentSearch]);

  /**
   * Update URL search params without full page reload.
   */
  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`);
    },
    [router, pathname, searchParams],
  );

  /**
   * Handle search input with 300ms debounce.
   */
  const handleSearchChange = (value: string) => {
    setSearchValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateParams({ search: value || null });
    }, 300);
  };

  /**
   * Toggle a tag on/off in the URL params.
   */
  const toggleTag = (tag: string) => {
    const next = currentTags.includes(tag)
      ? currentTags.filter((t) => t !== tag)
      : [...currentTags, tag];
    updateParams({ tags: next.length > 0 ? next.join(",") : null });
  };

  /**
   * Clear all filters.
   */
  const clearFilters = () => {
    setSearchValue("");
    router.replace(pathname);
  };

  const hasFilters = currentSearch || currentTags.length > 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Search templates..."
          value={searchValue}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-9"
        />
        {hasFilters && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="absolute right-2 top-1/2 -translate-y-1/2"
            onClick={clearFilters}
          >
            <X className="size-3" />
            <span className="sr-only">Clear filters</span>
          </Button>
        )}
      </div>

      {/* Tag filter row */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => {
            const isActive = currentTags.includes(tag);
            return (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * TemplateSearch — Client component for search input and tag filtering.
 * Wraps inner component in Suspense (required for useSearchParams in Next.js).
 */
export function TemplateSearch({ tags }: { tags: string[] }) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-3">
          <div className="h-9 rounded-md bg-muted animate-pulse" />
        </div>
      }
    >
      <TemplateSearchInner tags={tags} />
    </Suspense>
  );
}
