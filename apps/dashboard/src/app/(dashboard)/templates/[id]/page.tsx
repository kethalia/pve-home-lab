import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";

import { DatabaseService } from "@/lib/db";
import { parseTags } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TemplateConfigTab } from "@/components/templates/template-config-tab";
import { TemplateScriptsTab } from "@/components/templates/template-scripts-tab";
import { TemplatePackagesTab } from "@/components/templates/template-packages-tab";
import { TemplateFilesTab } from "@/components/templates/template-files-tab";

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const template = await DatabaseService.getTemplateById(id);

  if (!template) {
    notFound();
  }

  const tags = parseTags(template.tags);

  return (
    <div className="flex flex-1 flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <Link
          href="/templates"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeft className="size-4" />
          Back to Templates
        </Link>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-3xl font-bold">{template.name}</h1>
            {template.description && (
              <p className="text-muted-foreground">{template.description}</p>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <Badge variant="outline">{template.source}</Badge>
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
          <Button asChild className="mt-2 sm:mt-0">
            <Link href={`/templates/${template.id}/edit`}>
              <Pencil className="size-4" />
              Edit Template
            </Link>
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="config">
        <TabsList>
          <TabsTrigger value="config">Config</TabsTrigger>
          <TabsTrigger value="scripts">
            Scripts ({template.scripts.length})
          </TabsTrigger>
          <TabsTrigger value="packages">
            Packages ({template.packages.length})
          </TabsTrigger>
          <TabsTrigger value="files">
            Files ({template.files.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="mt-4">
          <TemplateConfigTab template={template} />
        </TabsContent>

        <TabsContent value="scripts" className="mt-4">
          <TemplateScriptsTab scripts={template.scripts} />
        </TabsContent>

        <TabsContent value="packages" className="mt-4">
          <TemplatePackagesTab packages={template.packages} />
        </TabsContent>

        <TabsContent value="files" className="mt-4">
          <TemplateFilesTab files={template.files} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
