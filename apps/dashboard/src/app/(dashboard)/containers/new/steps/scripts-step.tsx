"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

import type { ScriptConfig } from "@/lib/containers/schemas";

interface ScriptsStepProps {
  data: ScriptConfig | null;
  templateScripts: Array<{
    id: string;
    name: string;
    order: number;
    enabled: boolean;
    description: string | null;
  }>;
  onNext: (data: ScriptConfig) => void;
  onBack: () => void;
}

export function ScriptsStep({
  data,
  templateScripts,
  onNext,
  onBack,
}: ScriptsStepProps) {
  const [scripts, setScripts] = useState(
    data?.scripts ??
      templateScripts.map((s) => ({
        id: s.id,
        name: s.name,
        enabled: s.enabled,
        order: s.order,
        description: s.description,
      })),
  );

  function toggleScript(id: string) {
    setScripts((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)),
    );
  }

  function moveUp(index: number) {
    if (index === 0) return;
    setScripts((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      // Update order values
      return next.map((s, i) => ({ ...s, order: i }));
    });
  }

  function moveDown(index: number) {
    if (index === scripts.length - 1) return;
    setScripts((prev) => {
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      // Update order values
      return next.map((s, i) => ({ ...s, order: i }));
    });
  }

  function handleNext() {
    onNext({ scripts });
  }

  const hasScripts = scripts.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Scripts</h2>
        <p className="text-sm text-muted-foreground">
          {hasScripts
            ? "Enable or disable scripts and adjust their execution order."
            : "No scripts configured for this template."}
        </p>
      </div>

      {hasScripts ? (
        <div className="space-y-3">
          {scripts.map((script, index) => (
            <Card key={script.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Switch
                      id={`script-${script.id}`}
                      checked={script.enabled}
                      onCheckedChange={() => toggleScript(script.id)}
                    />
                    <div>
                      <CardTitle className="text-sm font-medium">
                        <Label
                          htmlFor={`script-${script.id}`}
                          className="cursor-pointer"
                        >
                          {script.name}
                        </Label>
                      </CardTitle>
                      {script.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {script.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => moveUp(index)}
                      disabled={index === 0}
                    >
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => moveDown(index)}
                      disabled={index === scripts.length - 1}
                    >
                      <ArrowDown className="size-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No scripts configured. You can add scripts to your template to run
            setup commands during container creation.
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={handleNext}>Next</Button>
      </div>
    </div>
  );
}
