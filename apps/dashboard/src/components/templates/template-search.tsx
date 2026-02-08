"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupIcon,
  InputGroupAction,
} from "@/components/ui/input-group";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

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

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

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
      <InputGroup>
        <InputGroupIcon side="leading">
          <Search />
        </InputGroupIcon>
        <Input
          placeholder="Search templates..."
          value={searchValue}
          onChange={(e) => handleSearchChange(e.target.value)}
        />
        {hasFilters && (
          <InputGroupAction side="trailing">
            <Button variant="ghost" size="icon-xs" onClick={clearFilters}>
              <X className="size-3" />
              <span className="sr-only">Clear filters</span>
            </Button>
          </InputGroupAction>
        )}
      </InputGroup>

      {/* Tag filter row */}
      {tags.length > 0 && (
        <div
          role="group"
          aria-label="Filter by tags"
          className="flex flex-wrap gap-1.5"
        >
          {tags.map((tag) => {
            const isActive = currentTags.includes(tag);
            return (
              <Button
                key={tag}
                variant={isActive ? "default" : "secondary"}
                size="xs"
                onClick={() => toggleTag(tag)}
                aria-pressed={isActive}
                className="rounded-full"
              >
                {tag}
              </Button>
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
          <Skeleton className="h-9 w-full" />
        </div>
      }
    >
      <TemplateSearchInner tags={tags} />
    </Suspense>
  );
}
