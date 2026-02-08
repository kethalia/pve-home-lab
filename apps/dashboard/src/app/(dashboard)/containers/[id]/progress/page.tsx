"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Loader2,
  Plus,
  Globe,
  Key,
  Eye,
  EyeOff,
  Copy,
  ExternalLink,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

import { useContainerProgress } from "@/hooks/use-container-progress";
import { ProgressStepper } from "./progress-stepper";
import { LogViewer } from "./log-viewer";

// ============================================================================
// Types for services fetched on completion
// ============================================================================

interface ContainerServiceInfo {
  id: string;
  name: string;
  type: string;
  port: number | null;
  webUrl: string | null;
  status: string;
  credentials: string | null;
}

// ============================================================================
// Page Component
// ============================================================================

export default function ContainerProgressPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const containerId = params.id;

  const { status, percent, isComplete, isError, errorMessage, steps, logs } =
    useContainerProgress(containerId);

  const [services, setServices] = useState<ContainerServiceInfo[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);

  // Fetch services on completion
  const fetchServices = useCallback(async () => {
    setLoadingServices(true);
    try {
      const res = await fetch(`/api/containers/${containerId}/services`);
      if (res.ok) {
        const data = (await res.json()) as ContainerServiceInfo[];
        setServices(data);
      }
    } catch {
      // Non-fatal: services just won't display
    } finally {
      setLoadingServices(false);
    }
  }, [containerId]);

  useEffect(() => {
    if (isComplete) {
      fetchServices();
    }
  }, [isComplete, fetchServices]);

  // --- Connecting state ---
  if (status === "connecting") {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <Loader2 className="text-muted-foreground size-5 animate-spin" />
          <h1 className="text-2xl font-bold">Creating Container</h1>
        </div>
        <Card>
          <CardContent className="space-y-4">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-2 w-full" />
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-1/2" />
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Skeleton className="h-[200px] w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // --- Error state ---
  if (isError) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <XCircle className="text-destructive size-6" />
          <h1 className="text-2xl font-bold">Creation Failed</h1>
        </div>

        <Card>
          <CardContent className="space-y-4">
            <ProgressStepper steps={steps} percent={percent} />
          </CardContent>
        </Card>

        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2 text-lg">
              <XCircle className="size-5" />
              Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              {errorMessage ||
                "An unknown error occurred during container creation."}
            </p>
          </CardContent>
          <CardFooter className="gap-3">
            <Button
              variant="outline"
              onClick={() => router.push("/containers/new")}
            >
              <ArrowLeft className="size-4" />
              Try Again
            </Button>
          </CardFooter>
        </Card>

        <LogViewer logs={logs} />
      </div>
    );
  }

  // --- Complete state ---
  if (isComplete) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-6">
        {/* Success banner */}
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="flex flex-col items-center gap-3 py-8">
            <div className="flex size-16 items-center justify-center rounded-full bg-green-500/10">
              <CheckCircle2 className="size-9 text-green-500" />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold">Container Ready</h1>
              <p className="text-muted-foreground mt-1 text-sm">
                Your container has been created and is running.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button onClick={() => router.push(`/containers/${containerId}`)}>
                View Container
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push("/containers/new")}
              >
                <Plus className="size-4" />
                Create Another
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4">
            <ProgressStepper steps={steps} percent={percent} />
          </CardContent>
        </Card>

        {/* Services */}
        {loadingServices ? (
          <Card>
            <CardContent>
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        ) : services.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Discovered Services</CardTitle>
              <CardDescription>
                Services detected running in your container
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {services.map((service) => (
                <ServiceCard key={service.id} service={service} />
              ))}
            </CardContent>
          </Card>
        ) : null}

        <LogViewer logs={logs} />
      </div>
    );
  }

  // --- Streaming state (default) ---
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Loader2 className="text-primary size-5 animate-spin" />
        <h1 className="text-2xl font-bold">Creating Container</h1>
      </div>

      <Card>
        <CardContent className="space-y-4">
          <ProgressStepper steps={steps} percent={percent} />
        </CardContent>
      </Card>

      <LogViewer logs={logs} />
    </div>
  );
}

// ============================================================================
// Service Card Sub-component
// ============================================================================

function ServiceCard({ service }: { service: ContainerServiceInfo }) {
  const [showCredentials, setShowCredentials] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const credentials = service.credentials
    ? (() => {
        try {
          return JSON.parse(service.credentials) as Record<string, string>;
        } catch {
          return null;
        }
      })()
    : null;

  async function copyToClipboard(value: string, field: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Clipboard may not be available
    }
  }

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="text-muted-foreground size-4" />
          <span className="font-medium">{service.name}</span>
          <Badge variant="secondary">{service.type}</Badge>
          <Badge variant={service.status === "running" ? "default" : "outline"}>
            {service.status}
          </Badge>
        </div>
        {service.port && (
          <span className="text-muted-foreground text-sm">
            Port {service.port}
          </span>
        )}
      </div>

      {service.webUrl && (
        <div className="mt-2">
          <a
            href={service.webUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary inline-flex items-center gap-1 text-sm hover:underline"
          >
            {service.webUrl}
            <ExternalLink className="size-3" />
          </a>
        </div>
      )}

      {credentials && (
        <div className="mt-3 space-y-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCredentials((prev) => !prev)}
          >
            <Key className="size-3" />
            {showCredentials ? "Hide" : "Show"} Credentials
            {showCredentials ? (
              <EyeOff className="size-3" />
            ) : (
              <Eye className="size-3" />
            )}
          </Button>

          {showCredentials && (
            <div className="space-y-1 rounded-md bg-zinc-950 p-3 font-mono text-xs">
              {Object.entries(credentials).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between">
                  <span>
                    <span className="text-zinc-500">{key}:</span>{" "}
                    <span className="text-zinc-300">{value}</span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => copyToClipboard(value, key)}
                  >
                    {copiedField === key ? (
                      <CheckCircle2 className="size-3 text-green-500" />
                    ) : (
                      <Copy className="text-zinc-500 size-3" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
