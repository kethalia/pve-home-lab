"use client";

import { Loader2, FolderSearch } from "lucide-react";
import { useAction } from "next-safe-action/hooks";

import { Button } from "@/components/ui/button";
import { discoverTemplatesAction } from "@/lib/templates/actions";

/**
 * DiscoverButton — Triggers filesystem template discovery and refreshes the page.
 * Uses next-safe-action for session validation and error handling.
 */
export function DiscoverButton() {
  const { execute, isPending } = useAction(discoverTemplatesAction, {
    onSuccess: ({ data }) => {
      console.log(
        `[discover] Found ${data?.discovered} templates, ${data?.errors.length} errors`,
      );
    },
  });

  return (
    <Button onClick={() => execute()} disabled={isPending} variant="outline">
      {isPending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <FolderSearch className="size-4" />
      )}
      {isPending ? "Discovering..." : "Discover Templates"}
    </Button>
  );
}
