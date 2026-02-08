"use client";

import { useEffect, useRef } from "react";
import type { ProgressEvent } from "@/hooks/use-container-progress";

interface LogViewerProps {
  logs: ProgressEvent[];
}

export function LogViewer({ logs }: LogViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);

  // Track if user is scrolled to bottom
  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    // Auto-scroll if within 40px of the bottom
    shouldAutoScroll.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }

  // Auto-scroll on new logs
  useEffect(() => {
    const el = containerRef.current;
    if (el && shouldAutoScroll.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [logs.length]);

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Logs</h3>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="max-h-[400px] min-h-[200px] overflow-y-auto rounded-lg border bg-zinc-950 p-4 font-mono text-xs leading-relaxed"
      >
        {logs.length === 0 ? (
          <p className="text-zinc-500 italic">Waiting for logs...</p>
        ) : (
          logs.map((log, index) => (
            <div key={index} className="flex gap-2">
              <span className="shrink-0 select-none text-zinc-600">
                {formatTimestamp(log.timestamp)}
              </span>
              <span className="text-zinc-300">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}
