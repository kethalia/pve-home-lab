import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { DatabaseService } from "@/lib/db";
import { createTemplateAction } from "@/lib/templates/actions";
import { TemplateForm } from "@/components/templates/template-form";

export const metadata = {
  title: "Create Template",
  description: "Create a new LXC container template",
};

export default async function CreateTemplatePage() {
  const buckets = await DatabaseService.listBuckets();

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/templates"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeft className="size-4" />
          Back to Templates
        </Link>
        <h1 className="text-3xl font-bold">Create Template</h1>
        <p className="text-muted-foreground">
          Configure a new LXC container template with scripts, packages, and
          config files.
        </p>
      </div>

      <TemplateForm
        mode="create"
        buckets={buckets}
        action={createTemplateAction}
      />
    </div>
  );
}
