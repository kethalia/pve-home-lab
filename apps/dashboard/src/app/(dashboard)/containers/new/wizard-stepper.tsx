"use client";

import { Check } from "lucide-react";

const STEPS = [
  { number: 1, label: "Template" },
  { number: 2, label: "Configure" },
  { number: 3, label: "Packages" },
  { number: 4, label: "Scripts" },
  { number: 5, label: "Review" },
] as const;

interface WizardStepperProps {
  currentStep: number;
  completedSteps: number[];
}

export function WizardStepper({
  currentStep,
  completedSteps,
}: WizardStepperProps) {
  return (
    <nav aria-label="Wizard progress" className="w-full">
      <ol className="flex items-center justify-between">
        {STEPS.map((step, index) => {
          const isCompleted = completedSteps.includes(step.number);
          const isCurrent = currentStep === step.number;
          const isLast = index === STEPS.length - 1;

          return (
            <li
              key={step.number}
              className={`flex items-center ${isLast ? "" : "flex-1"}`}
            >
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`flex size-8 items-center justify-center rounded-full border-2 text-sm font-medium transition-colors ${
                    isCompleted
                      ? "border-primary bg-primary text-primary-foreground"
                      : isCurrent
                        ? "border-primary bg-background text-primary"
                        : "border-muted-foreground/30 bg-background text-muted-foreground/50"
                  }`}
                >
                  {isCompleted ? <Check className="size-4" /> : step.number}
                </div>
                <span
                  className={`text-xs font-medium ${
                    isCurrent
                      ? "text-primary"
                      : isCompleted
                        ? "text-foreground"
                        : "text-muted-foreground/50"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {!isLast && (
                <div
                  className={`mx-2 mb-5 h-0.5 flex-1 transition-colors ${
                    isCompleted ? "bg-primary" : "bg-muted-foreground/20"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
