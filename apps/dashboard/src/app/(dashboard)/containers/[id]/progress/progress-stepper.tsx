"use client";

import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StepInfo } from "@/hooks/use-container-progress";

interface ProgressStepperProps {
  steps: StepInfo[];
  percent: number;
}

export function ProgressStepper({ steps, percent }: ProgressStepperProps) {
  return (
    <div className="space-y-4">
      {/* Overall progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Overall Progress</span>
          <span className="font-medium">{percent}%</span>
        </div>
        <div className="bg-secondary h-2 w-full overflow-hidden rounded-full">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500 ease-out",
              percent === 100 ? "bg-green-500" : "bg-primary",
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Phase steps */}
      <nav aria-label="Creation progress">
        <ol className="space-y-2">
          {steps.map((step, index) => {
            const isLast = index === steps.length - 1;

            return (
              <li key={step.name} className="flex items-start gap-3">
                {/* Step icon */}
                <div className="flex flex-col items-center">
                  <StepIcon status={step.status} />
                  {!isLast && (
                    <div
                      className={cn(
                        "mt-1 h-4 w-0.5",
                        step.status === "completed"
                          ? "bg-green-500"
                          : step.status === "error"
                            ? "bg-destructive"
                            : "bg-muted-foreground/20",
                      )}
                    />
                  )}
                </div>

                {/* Step label */}
                <span
                  className={cn(
                    "text-sm font-medium",
                    step.status === "active" && "text-primary",
                    step.status === "completed" &&
                      "text-green-600 dark:text-green-400",
                    step.status === "error" && "text-destructive",
                    step.status === "pending" && "text-muted-foreground",
                  )}
                >
                  {step.label}
                  {step.status === "active" && (
                    <span className="text-muted-foreground ml-2 text-xs">
                      In progress...
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}

function StepIcon({ status }: { status: StepInfo["status"] }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="size-5 text-green-500" />;
    case "active":
      return <Loader2 className="text-primary size-5 animate-spin" />;
    case "error":
      return <XCircle className="text-destructive size-5" />;
    case "pending":
    default:
      return <Circle className="text-muted-foreground/30 size-5" />;
  }
}
