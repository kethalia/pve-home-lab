"use client";

import { useState } from "react";
import type { TemplateScript } from "@/generated/prisma/client";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronRight, FileCode } from "lucide-react";

/**
 * TemplateScriptsTab — Displays scripts in execution order with expandable content.
 * Client Component ("use client") for collapsible interactions.
 */
export function TemplateScriptsTab({ scripts }: { scripts: TemplateScript[] }) {
  if (scripts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <FileCode className="size-10 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">No scripts configured</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {scripts.map((script) => (
        <ScriptItem key={script.id} script={script} />
      ))}
    </div>
  );
}

function ScriptItem({ script }: { script: TemplateScript }) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="flex w-full items-center gap-3 rounded-lg border px-4 py-3 h-auto text-left hover:bg-muted/50 transition-colors"
        >
          <ChevronRight
            className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
          />
          <Badge variant="outline" className="shrink-0 tabular-nums">
            #{script.order}
          </Badge>
          <span className="flex-1 text-sm font-medium truncate">
            {script.name}
          </span>
          <Badge variant={script.enabled ? "default" : "secondary"}>
            {script.enabled ? "Enabled" : "Disabled"}
          </Badge>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-7 mt-1 rounded-lg border bg-muted/30 p-4">
          {script.description && (
            <p className="mb-3 text-sm text-muted-foreground">
              {script.description}
            </p>
          )}
          <pre className="overflow-x-auto rounded-md bg-background p-3 text-xs font-mono leading-relaxed border">
            <code>{script.content}</code>
          </pre>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
