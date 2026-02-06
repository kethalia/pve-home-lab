"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2, FolderSearch } from "lucide-react";

import { Button } from "@/components/ui/button";
import { discoverTemplatesAction } from "@/lib/templates/actions";

/**
 * DiscoverButton — Triggers filesystem template discovery and refreshes the page.
 * Uses useTransition to avoid blocking UI during the async server action.
 */
export function DiscoverButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleDiscover = () => {
    startTransition(async () => {
      const result = await discoverTemplatesAction();
      // Log result for debugging; UI refreshes via router.refresh()
      console.log(
        `[discover] Found ${result.discovered} templates, ${result.errors.length} errors`,
      );
      router.refresh();
    });
  };

  return (
    <Button onClick={handleDiscover} disabled={isPending} variant="outline">
      {isPending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <FolderSearch className="size-4" />
      )}
      {isPending ? "Discovering..." : "Discover Templates"}
    </Button>
  );
}
