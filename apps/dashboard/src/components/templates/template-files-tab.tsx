"use client";

import { useState } from "react";
import type { TemplateFile } from "@/generated/prisma/client";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronRight, FileText } from "lucide-react";

/** Display labels for file policies */
const policyLabels: Record<string, string> = {
  replace: "Replace",
  default: "Default",
  backup: "Backup",
};

/** Badge variant per policy */
const policyVariant: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  replace: "destructive",
  default: "secondary",
  backup: "outline",
};

/**
 * TemplateFilesTab — Displays config files with target path, policy, and expandable content.
 * Client Component ("use client") for collapsible interactions.
 */
export function TemplateFilesTab({ files }: { files: TemplateFile[] }) {
  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <FileText className="size-10 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">No config files</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {files.map((file) => (
        <FileItem key={file.id} file={file} />
      ))}
    </div>
  );
}

function FileItem({ file }: { file: TemplateFile }) {
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
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium truncate">
              {file.name}
            </span>
            <span className="block text-xs font-mono text-muted-foreground truncate">
              {file.targetPath}
            </span>
          </span>
          <Badge variant={policyVariant[file.policy] ?? "outline"}>
            {policyLabels[file.policy] ?? file.policy}
          </Badge>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-7 mt-1 rounded-lg border bg-muted/30 p-4">
          <pre className="overflow-x-auto rounded-md bg-background p-3 text-xs font-mono leading-relaxed border">
            <code>{file.content}</code>
          </pre>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
