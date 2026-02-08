/**
 * SSE endpoint for real-time container creation progress.
 *
 * On connect:
 * 1. Verify container exists
 * 2. Replay persisted ContainerEvent rows (for late subscribers)
 * 3. If terminal state (ready/error), close after replay
 * 4. Otherwise subscribe to Redis Pub/Sub for live events
 * 5. Send heartbeat every 15s, clean up on client disconnect
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import Redis from "ioredis";
import { DatabaseService } from "@/lib/db";
import {
  getProgressChannel,
  type ContainerProgressEvent,
} from "@/lib/queue/container-creation";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: containerId } = await params;

  // Verify container exists
  const container = await DatabaseService.getContainerById(containerId);
  if (!container) {
    return NextResponse.json({ error: "Container not found" }, { status: 404 });
  }

  // Fetch existing events for replay
  const existingEvents = await DatabaseService.getContainerEvents(containerId);

  const isTerminal =
    container.lifecycle === "ready" || container.lifecycle === "error";

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
      let subscriber: Redis | null = null;
      let closed = false;

      function send(event: string, data: string) {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${data}\n\n`),
          );
        } catch {
          // Stream closed
          cleanup();
        }
      }

      function cleanup() {
        if (closed) return;
        closed = true;
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }
        if (subscriber) {
          subscriber.unsubscribe().catch(() => {});
          subscriber.disconnect();
          subscriber = null;
        }
        try {
          controller.close();
        } catch {
          // Already closed
        }
      }

      // Build snapshot from persisted events: derive current state instead of
      // replaying individual events (which arrive in a burst and break the UI).
      const lastStepEvent = [...existingEvents].reverse().find(
        (e) =>
          e.type !== "error" &&
          e.metadata &&
          (() => {
            try {
              return JSON.parse(e.metadata).step;
            } catch {
              return false;
            }
          })(),
      );
      const lastPercent = lastStepEvent?.metadata
        ? (() => {
            try {
              return JSON.parse(lastStepEvent.metadata!).percent ?? 0;
            } catch {
              return 0;
            }
          })()
        : 0;
      const lastStep = lastStepEvent?.metadata
        ? (() => {
            try {
              return JSON.parse(lastStepEvent.metadata!).step ?? null;
            } catch {
              return null;
            }
          })()
        : null;

      // Compute which steps have been seen from persisted events
      const seenSteps: string[] = [];
      for (const event of existingEvents) {
        if (event.metadata) {
          try {
            const meta = JSON.parse(event.metadata);
            if (meta.step && !seenSteps.includes(meta.step)) {
              seenSteps.push(meta.step);
            }
          } catch {
            // ignore
          }
        }
      }

      // Check terminal state — use container lifecycle as source of truth,
      // NOT DB event types (which can collide between step events and completion).
      const hasError = existingEvents.some((e) => e.type === "error");
      const errorEvent = existingEvents.find((e) => e.type === "error");

      // Send a single snapshot event with the current state
      send(
        "snapshot",
        JSON.stringify({
          step: lastStep,
          percent: isTerminal && !hasError ? 100 : lastPercent,
          seenSteps,
          isComplete: isTerminal && container.lifecycle === "ready",
          isError: hasError || (isTerminal && container.lifecycle === "error"),
          errorMessage:
            errorEvent?.message ||
            (isTerminal && container.lifecycle === "error"
              ? "Container creation failed"
              : null),
        }),
      );

      // If container is already in terminal state, close after snapshot
      if (isTerminal) {
        send("done", JSON.stringify({ reason: "terminal" }));
        cleanup();
        return;
      }

      // Subscribe to Redis Pub/Sub for live events
      const redisUrl = process.env.REDIS_URL;
      if (!redisUrl) {
        send(
          "progress",
          JSON.stringify({
            type: "error",
            message: "Server configuration error: Redis not configured",
            timestamp: new Date().toISOString(),
          } satisfies ContainerProgressEvent),
        );
        cleanup();
        return;
      }

      subscriber = new Redis(redisUrl);
      const channel = getProgressChannel(containerId);

      subscriber.subscribe(channel).catch((err) => {
        console.error("Redis subscribe error:", err);
        cleanup();
      });

      subscriber.on("message", (_ch: string, message: string) => {
        send("progress", message);

        // Check if this is a terminal event
        try {
          const parsed = JSON.parse(message) as ContainerProgressEvent;
          if (parsed.type === "complete" || parsed.type === "error") {
            send("done", JSON.stringify({ reason: parsed.type }));
            cleanup();
          }
        } catch {
          // Not valid JSON, ignore
        }
      });

      subscriber.on("error", (err) => {
        console.error("Redis subscriber error:", err);
        cleanup();
      });

      // Heartbeat every 15s to keep connection alive
      heartbeatInterval = setInterval(() => {
        send("heartbeat", JSON.stringify({ time: new Date().toISOString() }));
      }, 15_000);

      // Clean up on client disconnect
      _request.signal.addEventListener("abort", () => {
        cleanup();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
