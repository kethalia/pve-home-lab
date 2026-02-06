import type { TemplateWithDetails } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Format memory value: display as GB if >= 1024 MB, otherwise MB.
 */
function formatMemory(mb: number | null): string {
  if (mb === null) return "—";
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB (${mb} MB)`;
  return `${mb} MB`;
}

/**
 * Feature indicator: shows green "Enabled" or gray "Disabled".
 */
function FeatureFlag({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <span className="text-sm font-medium">{label}</span>
      <Badge variant={enabled ? "default" : "secondary"}>
        {enabled ? "Enabled" : "Disabled"}
      </Badge>
    </div>
  );
}

/**
 * Stat item: label + value pair for the resource grid.
 */
function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

/**
 * TemplateConfigTab — Displays template configuration in organized sections.
 * Server Component (no "use client").
 */
export function TemplateConfigTab({
  template,
}: {
  template: TemplateWithDetails;
}) {
  const tags = template.tags
    ? template.tags
        .split(";")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  return (
    <div className="grid gap-4">
      {/* General section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">General</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm">
            <div className="grid grid-cols-[140px_1fr] items-start gap-2">
              <dt className="text-muted-foreground">Name</dt>
              <dd className="font-medium">{template.name}</dd>
            </div>
            {template.description && (
              <div className="grid grid-cols-[140px_1fr] items-start gap-2">
                <dt className="text-muted-foreground">Description</dt>
                <dd>{template.description}</dd>
              </div>
            )}
            <div className="grid grid-cols-[140px_1fr] items-start gap-2">
              <dt className="text-muted-foreground">Source</dt>
              <dd>
                <Badge variant="outline">{template.source}</Badge>
              </dd>
            </div>
            {template.path && (
              <div className="grid grid-cols-[140px_1fr] items-start gap-2">
                <dt className="text-muted-foreground">Path</dt>
                <dd className="font-mono text-xs break-all">{template.path}</dd>
              </div>
            )}
            {template.osTemplate && (
              <div className="grid grid-cols-[140px_1fr] items-start gap-2">
                <dt className="text-muted-foreground">OS Template</dt>
                <dd className="font-mono text-xs">{template.osTemplate}</dd>
              </div>
            )}
            {tags.length > 0 && (
              <div className="grid grid-cols-[140px_1fr] items-start gap-2">
                <dt className="text-muted-foreground">Tags</dt>
                <dd className="flex flex-wrap gap-1">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* Resources section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resources</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatItem label="CPU" value={`${template.cores ?? "—"} cores`} />
            <StatItem label="Memory" value={formatMemory(template.memory)} />
            <StatItem label="Swap" value={formatMemory(template.swap)} />
            <StatItem
              label="Disk"
              value={template.diskSize ? `${template.diskSize} GB` : "—"}
            />
            <StatItem label="Storage" value={template.storage ?? "—"} />
            <StatItem label="Network Bridge" value={template.bridge ?? "—"} />
          </div>
        </CardContent>
      </Card>

      {/* Features section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Features</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <FeatureFlag label="Unprivileged" enabled={template.unprivileged} />
            <FeatureFlag label="Nesting" enabled={template.nesting} />
            <FeatureFlag label="Keyctl" enabled={template.keyctl} />
            <FeatureFlag label="FUSE" enabled={template.fuse} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
