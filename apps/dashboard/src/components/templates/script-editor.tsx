"use client";

/**
 * Script Editor — Sub-form for managing template scripts.
 *
 * Controlled component: receives scripts state and emits onChange.
 * Supports add, remove, reorder (via order number), content editing,
 * and enabled/disabled toggle per script.
 */

import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export interface ScriptInput {
  _key: string;
  name: string;
  order: number;
  content: string;
  description?: string;
  enabled: boolean;
}

let scriptKeyCounter = 0;
export function createScriptInput(
  init: Omit<ScriptInput, "_key"> = {
    name: "",
    order: 1,
    content: "",
    description: "",
    enabled: true,
  },
): ScriptInput {
  return { ...init, _key: `script-${++scriptKeyCounter}` };
}

interface ScriptEditorProps {
  scripts: ScriptInput[];
  onChange: (scripts: ScriptInput[]) => void;
}

export function ScriptEditor({ scripts, onChange }: ScriptEditorProps) {
  // Sort scripts by order for display
  const sorted = [...scripts].sort((a, b) => a.order - b.order);

  const addScript = () => {
    const nextOrder =
      scripts.length > 0 ? Math.max(...scripts.map((s) => s.order)) + 1 : 1;
    onChange([
      ...scripts,
      createScriptInput({
        name: "",
        order: nextOrder,
        content: "",
        description: "",
        enabled: true,
      }),
    ]);
  };

  const removeScript = (index: number) => {
    // Find the actual index in the unsorted array
    const sortedItem = sorted[index];
    const originalIndex = scripts.indexOf(sortedItem);
    onChange(scripts.filter((_, i) => i !== originalIndex));
  };

  const updateScript = (
    index: number,
    field: keyof ScriptInput,
    value: string | number | boolean,
  ) => {
    const sortedItem = sorted[index];
    const originalIndex = scripts.indexOf(sortedItem);
    const updated = [...scripts];
    updated[originalIndex] = { ...updated[originalIndex], [field]: value };
    onChange(updated);
  };

  return (
    <div className="space-y-4">
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No scripts added yet. Scripts run in order during container setup.
        </p>
      ) : (
        sorted.map((script, index) => (
          <div
            key={script._key}
            className="relative rounded-lg border p-4 space-y-3"
          >
            {/* Header row: order, name, enabled toggle, remove */}
            <div className="flex items-center gap-3">
              <div className="w-16">
                <Label className="text-xs text-muted-foreground">Order</Label>
                <Input
                  type="number"
                  min={0}
                  value={script.order}
                  onChange={(e) =>
                    updateScript(index, "order", parseInt(e.target.value) || 0)
                  }
                  className="h-8 text-center"
                />
              </div>
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">Name</Label>
                <Input
                  value={script.name}
                  onChange={(e) => updateScript(index, "name", e.target.value)}
                  placeholder="e.g., install-packages"
                  className="h-8"
                />
              </div>
              <div className="flex items-center gap-2 pt-4">
                <Switch
                  checked={script.enabled}
                  onCheckedChange={(checked) =>
                    updateScript(index, "enabled", checked)
                  }
                />
                <span className="text-xs text-muted-foreground">
                  {script.enabled ? "Enabled" : "Disabled"}
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="mt-4"
                onClick={() => removeScript(index)}
              >
                <X className="size-4" />
                <span className="sr-only">Remove script</span>
              </Button>
            </div>

            {/* Description */}
            <div>
              <Label className="text-xs text-muted-foreground">
                Description (optional)
              </Label>
              <Input
                value={script.description || ""}
                onChange={(e) =>
                  updateScript(index, "description", e.target.value)
                }
                placeholder="Brief description of what this script does"
                className="h-8"
              />
            </div>

            {/* Content */}
            <div>
              <Label className="text-xs text-muted-foreground">Content</Label>
              <Textarea
                value={script.content}
                onChange={(e) => updateScript(index, "content", e.target.value)}
                placeholder="#!/bin/bash&#10;# Script content..."
                className="min-h-24 font-mono text-sm"
                rows={4}
              />
            </div>
          </div>
        ))
      )}

      <Button type="button" variant="outline" size="sm" onClick={addScript}>
        <Plus className="size-4" />
        Add Script
      </Button>
    </div>
  );
}
