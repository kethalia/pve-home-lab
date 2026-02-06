"use client";

/**
 * File Editor — Sub-form for managing template config files.
 *
 * Controlled component: receives files state and emits onChange.
 * Supports add, remove, and editing of name, target path, policy, and content.
 */

import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface FileInput {
  _key: string;
  name: string;
  targetPath: string;
  policy: "replace" | "default" | "backup";
  content: string;
}

let fileKeyCounter = 0;
export function createFileInput(
  init: Omit<FileInput, "_key"> = {
    name: "",
    targetPath: "",
    policy: "replace",
    content: "",
  },
): FileInput {
  return { ...init, _key: `file-${++fileKeyCounter}` };
}

interface FileEditorProps {
  files: FileInput[];
  onChange: (files: FileInput[]) => void;
}

export function FileEditor({ files, onChange }: FileEditorProps) {
  const addFile = () => {
    onChange([...files, createFileInput()]);
  };

  const removeFile = (index: number) => {
    onChange(files.filter((_, i) => i !== index));
  };

  const updateFile = (index: number, field: keyof FileInput, value: string) => {
    const updated = [...files];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  return (
    <div className="space-y-4">
      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No config files added yet. Files are deployed to the container at
          their target paths.
        </p>
      ) : (
        files.map((file, index) => (
          <div
            key={file._key}
            className="relative rounded-lg border p-4 space-y-3"
          >
            {/* Header row: name, remove */}
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">Name</Label>
                <Input
                  value={file.name}
                  onChange={(e) => updateFile(index, "name", e.target.value)}
                  placeholder="e.g., nginx.conf"
                  className="h-8"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="mt-4"
                onClick={() => removeFile(index)}
              >
                <X className="size-4" />
                <span className="sr-only">Remove file</span>
              </Button>
            </div>

            {/* Target path and policy */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs text-muted-foreground">
                  Target Path
                </Label>
                <Input
                  value={file.targetPath}
                  onChange={(e) =>
                    updateFile(index, "targetPath", e.target.value)
                  }
                  placeholder="/etc/nginx/nginx.conf"
                  className="h-8 font-mono text-sm"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Policy</Label>
                <Select
                  value={file.policy}
                  onValueChange={(value) => updateFile(index, "policy", value)}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="replace">Replace</SelectItem>
                    <SelectItem value="default">Default</SelectItem>
                    <SelectItem value="backup">Backup</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Content */}
            <div>
              <Label className="text-xs text-muted-foreground">Content</Label>
              <Textarea
                value={file.content}
                onChange={(e) => updateFile(index, "content", e.target.value)}
                placeholder="# File content..."
                className="min-h-24 font-mono text-sm"
                rows={4}
              />
            </div>
          </div>
        ))
      )}

      <Button type="button" variant="outline" size="sm" onClick={addFile}>
        <Plus className="size-4" />
        Add File
      </Button>
    </div>
  );
}
