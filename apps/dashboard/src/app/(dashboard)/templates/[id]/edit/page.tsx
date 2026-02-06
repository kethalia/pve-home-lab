import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { DatabaseService } from "@/lib/db";
import { updateTemplateAction } from "@/lib/templates/actions";
import { TemplateForm } from "@/components/templates/template-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const template = await DatabaseService.getTemplateById(id);

  if (!template) {
    return { title: "Template Not Found" };
  }

  return {
    title: `Edit: ${template.name}`,
    description: `Edit template ${template.name}`,
  };
}

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [template, buckets] = await Promise.all([
    DatabaseService.getTemplateById(id),
    DatabaseService.listBuckets(),
  ]);

  if (!template) {
    notFound();
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href={`/templates/${template.id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeft className="size-4" />
          Back to Template
        </Link>
        <h1 className="text-3xl font-bold">Edit: {template.name}</h1>
        <p className="text-muted-foreground">
          Update template configuration, scripts, packages, and files.
        </p>
      </div>

      <TemplateForm
        mode="edit"
        template={template}
        buckets={buckets}
        action={updateTemplateAction}
      />
    </div>
  );
}
