"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ============================================================================
// Types
// ============================================================================

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export type StepName =
  | "creating"
  | "starting"
  | "deploying"
  | "syncing"
  | "finalizing";

export type EventType = "step" | "log" | "complete" | "error";

export interface ProgressEvent {
  type: EventType;
  step?: StepName;
  percent?: number;
  message: string;
  timestamp: string;
}

export interface StepInfo {
  name: StepName;
  label: string;
  status: "pending" | "active" | "completed" | "error";
}

const PIPELINE_STEPS: { name: StepName; label: string }[] = [
  { name: "creating", label: "Creating Container" },
  { name: "starting", label: "Starting Container" },
  { name: "deploying", label: "Deploying Config" },
  { name: "syncing", label: "Running Scripts" },
  { name: "finalizing", label: "Finalizing" },
];

// ============================================================================
// Hook
// ============================================================================

export function useContainerProgress(containerId: string) {
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [currentStep, setCurrentStep] = useState<StepName | null>(null);
  const [percent, setPercent] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const processEvent = useCallback((event: ProgressEvent) => {
    setEvents((prev) => [...prev, event]);

    switch (event.type) {
      case "step":
        if (event.step) setCurrentStep(event.step);
        if (event.percent != null) setPercent(event.percent);
        break;

      case "log":
        // Log events don't change step/percent
        break;

      case "complete":
        setIsComplete(true);
        setPercent(100);
        break;

      case "error":
        setIsError(true);
        setErrorMessage(event.message);
        break;
    }
  }, []);

  useEffect(() => {
    const url = `/api/containers/${containerId}/progress`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener("open", () => {
      setStatus("connected");
    });

    eventSource.addEventListener("progress", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as ProgressEvent;
        processEvent(data);
      } catch {
        // Ignore invalid JSON
      }
    });

    eventSource.addEventListener("done", () => {
      setStatus("disconnected");
      eventSource.close();
    });

    eventSource.addEventListener("heartbeat", () => {
      // Keep-alive, nothing to do
    });

    eventSource.addEventListener("error", () => {
      // EventSource auto-reconnects, but if it fails repeatedly
      // we mark as error. The browser handles retry automatically.
      if (eventSource.readyState === EventSource.CLOSED) {
        setStatus("error");
      }
    });

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [containerId, processEvent]);

  // Derive step statuses
  const steps: StepInfo[] = PIPELINE_STEPS.map((step) => {
    const stepIndex = PIPELINE_STEPS.findIndex((s) => s.name === step.name);
    const currentIndex = currentStep
      ? PIPELINE_STEPS.findIndex((s) => s.name === currentStep)
      : -1;

    let stepStatus: StepInfo["status"] = "pending";

    if (isError && step.name === currentStep) {
      stepStatus = "error";
    } else if (isComplete || stepIndex < currentIndex) {
      stepStatus = "completed";
    } else if (stepIndex === currentIndex) {
      stepStatus = isComplete ? "completed" : "active";
    }

    return {
      name: step.name,
      label: step.label,
      status: stepStatus,
    };
  });

  // Filter logs (type === "log") for the log viewer
  const logs = events.filter((e) => e.type === "log");

  return {
    events,
    status,
    currentStep,
    percent,
    isComplete,
    isError,
    errorMessage,
    steps,
    logs,
  };
}
