"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import type { TemplateSelection } from "@/lib/containers/schemas";
import type { WizardTemplate } from "@/lib/containers/actions";

interface TemplateStepProps {
  templates: WizardTemplate[];
  data: TemplateSelection | null;
  onNext: (data: TemplateSelection) => void;
}

export function TemplateStep({ templates, data, onNext }: TemplateStepProps) {
  const [selectedId, setSelectedId] = useState<string | null>(
    data?.templateId ?? null,
  );
  const [selectedName, setSelectedName] = useState<string | null>(
    data?.templateName ?? null,
  );

  function handleSelect(id: string | null, name: string | null) {
    setSelectedId(id);
    setSelectedName(name);
  }

  function handleNext() {
    onNext({
      templateId: selectedId,
      templateName: selectedName,
    });
  }

  // "from scratch" is selected when selectedId is explicitly null and selectedName is set
  const isFromScratch = selectedId === null && selectedName === "From Scratch";
  const hasSelection = selectedId !== null || isFromScratch;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Choose a Template</h2>
        <p className="text-sm text-muted-foreground">
          Select a template to pre-fill configuration, or start from scratch.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Start from Scratch card */}
        <Card
          className={`cursor-pointer transition-colors hover:border-primary/50 ${
            isFromScratch ? "border-primary ring-2 ring-primary/20" : ""
          }`}
          onClick={() => handleSelect(null, "From Scratch")}
        >
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="flex size-8 items-center justify-center rounded-md bg-muted">
                <Plus className="size-4" />
              </div>
              Start from Scratch
            </CardTitle>
            <CardDescription>
              Configure everything manually with default settings.
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Template cards */}
        {templates.map((template) => {
          const isSelected = selectedId === template.id;
          const tags = template.tags
            ? template.tags
                .split(";")
                .map((t) => t.trim())
                .filter(Boolean)
            : [];

          return (
            <Card
              key={template.id}
              className={`cursor-pointer transition-colors hover:border-primary/50 ${
                isSelected ? "border-primary ring-2 ring-primary/20" : ""
              }`}
              onClick={() => handleSelect(template.id, template.name)}
            >
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{template.name}</CardTitle>
                {template.description && (
                  <CardDescription className="line-clamp-2">
                    {template.description}
                  </CardDescription>
                )}
              </CardHeader>
              {(tags.length > 0 ||
                template.scripts.length > 0 ||
                template.packages.length > 0) && (
                <CardContent className="pt-0">
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                    {template.scripts.length > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {template.scripts.length} script
                        {template.scripts.length !== 1 ? "s" : ""}
                      </Badge>
                    )}
                    {template.packages.length > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {template.packages.length} pkg
                        {template.packages.length !== 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      <div className="flex justify-end">
        <Button onClick={handleNext} disabled={!hasSelection}>
          Next
        </Button>
      </div>
    </div>
  );
}
