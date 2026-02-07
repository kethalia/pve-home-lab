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

      // Replay existing events
      for (const event of existingEvents) {
        const replayEvent: ContainerProgressEvent = {
          type:
            event.type === "error"
              ? "error"
              : event.type === "created"
                ? "complete"
                : "step",
          message: event.message,
          timestamp: event.createdAt.toISOString(),
          ...(event.metadata
            ? (() => {
                try {
                  const meta = JSON.parse(event.metadata);
                  return {
                    step: meta.step,
                    percent: meta.percent,
                  };
                } catch {
                  return {};
                }
              })()
            : {}),
        };
        send("progress", JSON.stringify(replayEvent));
      }

      // If container is already in terminal state, close after replay
      if (isTerminal) {
        // Send a final terminal event if not already present
        const hasTerminal = existingEvents.some(
          (e) => e.type === "error" || e.type === "created",
        );
        if (!hasTerminal) {
          send(
            "progress",
            JSON.stringify({
              type: container.lifecycle === "ready" ? "complete" : "error",
              message:
                container.lifecycle === "ready"
                  ? "Container ready!"
                  : "Container creation failed",
              percent: container.lifecycle === "ready" ? 100 : undefined,
              timestamp: new Date().toISOString(),
            } satisfies ContainerProgressEvent),
          );
        }
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
