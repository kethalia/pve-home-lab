---
phase: 03-container-creation
plan: 04
subsystem: container-progress-tracking
tags: [sse, redis-pubsub, eventsource, real-time, progress-ui]
depends_on:
  requires: ["03-02", "03-03"]
  provides:
    [
      "container-progress-sse",
      "container-progress-page",
      "container-services-api",
    ]
  affects: ["04-01"]
tech-stack:
  added: []
  patterns:
    [
      "sse-with-redis-pubsub",
      "eventsource-react-hook",
      "event-replay-on-connect",
    ]
key-files:
  created:
    - apps/dashboard/src/app/api/containers/[id]/progress/route.ts
    - apps/dashboard/src/hooks/use-container-progress.ts
    - apps/dashboard/src/app/(dashboard)/containers/[id]/progress/page.tsx
    - apps/dashboard/src/app/(dashboard)/containers/[id]/progress/progress-stepper.tsx
    - apps/dashboard/src/app/(dashboard)/containers/[id]/progress/log-viewer.tsx
    - apps/dashboard/src/app/api/containers/[id]/services/route.ts
  modified: []
decisions:
  - id: "sse-replay-pattern"
    decision: "On SSE connect, replay all persisted ContainerEvent rows before subscribing to Redis Pub/Sub for live events"
    rationale: "Ensures late subscribers see full history; log events are Redis-only so only step/complete/error events persist"
  - id: "terminal-state-shortcircuit"
    decision: "If container lifecycle is already ready/error when SSE connects, replay events and close immediately without Redis subscription"
    rationale: "Avoids unnecessary Redis subscriptions for containers that finished before page load"
  - id: "services-api-route"
    decision: "Added /api/containers/[id]/services route handler to fetch discovered services on completion"
    rationale: "Progress page fetches services client-side after completion event rather than embedding in SSE stream"
metrics:
  duration: "~4 minutes"
  completed: "2026-02-07"
---

# Phase 03 Plan 04: Container Progress Tracking Summary

**One-liner:** SSE endpoint with Redis Pub/Sub subscription and ContainerEvent replay, useContainerProgress EventSource hook, and progress page with 5-phase stepper, terminal-style log viewer, and completion/error/credential display.

## Task Commits

| Task | Name                                                             | Commit    | Key Files                                                           |
| ---- | ---------------------------------------------------------------- | --------- | ------------------------------------------------------------------- |
| 1    | SSE endpoint and useContainerProgress hook                       | `0fef01d` | route.ts (progress), use-container-progress.ts                      |
| 2    | Progress tracking page with stepper, logs, and completion states | `dd87016` | page.tsx, progress-stepper.tsx, log-viewer.tsx, route.ts (services) |

## What Was Built

### SSE Endpoint (`/api/containers/[id]/progress/route.ts`)

- `force-dynamic` export for streaming response
- GET handler with Next.js 15 Promise params pattern
- Replays existing ContainerEvent rows on connect (maps EventType → ContainerProgressEvent)
- Terminal state shortcircuit: if container is `ready` or `error`, replays then closes without Redis
- Redis Pub/Sub subscription via dedicated ioredis connection for live events
- 15-second heartbeat interval to keep connection alive
- Clean disconnect on client abort signal
- SSE headers: text/event-stream, no-cache, keep-alive, X-Accel-Buffering: no

### useContainerProgress Hook (`use-container-progress.ts`)

- `"use client"` EventSource wrapper with reactive state
- Types: ProgressEvent, ConnectionStatus, StepInfo, StepName
- EventSource connects to `/api/containers/{id}/progress`
- Handles `progress`, `done`, `heartbeat`, and `error` event types
- Derives 5 pipeline step statuses (pending/active/completed/error) from current step
- Filters log events for log viewer
- Tracks: events[], status, currentStep, percent, isComplete, isError, errorMessage
- Cleanup: closes EventSource on unmount

### Progress Page UI

- **ProgressStepper** — 5 pipeline phases (Creating → Starting → Deploying → Syncing → Finalizing) with CheckCircle2/Loader2/XCircle/Circle icons, overall progress bar with percentage
- **LogViewer** — Dark terminal style (bg-zinc-950), monospace, auto-scroll with user-scroll detection, timestamps, "Waiting for logs..." placeholder, max-h-[400px]
- **Progress Page** — 4 states:
  - **Connecting:** Skeleton loaders
  - **Streaming:** Stepper + log viewer with spinning loader
  - **Complete:** Green success header, stepper at 100%, discovered services with credential cards (show/hide/copy), "View Container" and "Create Another" action buttons
  - **Error:** Red error header, error message, "Try Again" navigation

### Services API (`/api/containers/[id]/services/route.ts`)

- GET handler returns ContainerService records for a container
- Used by progress page client-side fetch on completion

## Decisions Made

1. **SSE replay pattern:** On connect, replay all persisted ContainerEvent rows before subscribing to Redis Pub/Sub. Log events are Redis-only and won't be replayed, but step/complete/error events persist in the DB.

2. **Terminal state shortcircuit:** If the container is already `ready` or `error` when the SSE endpoint is hit, replay events and close immediately. No Redis subscription needed.

3. **Services fetched on completion:** Rather than embedding service data in the SSE stream, the progress page fetches `/api/containers/[id]/services` client-side after receiving the `complete` event.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added /api/containers/[id]/services route**

- **Found during:** Task 2
- **Issue:** Progress page needs to fetch discovered services and credentials on completion, but no API endpoint existed
- **Fix:** Created `/api/containers/[id]/services/route.ts` with GET handler returning ContainerService records
- **Files created:** apps/dashboard/src/app/api/containers/[id]/services/route.ts
- **Commit:** `dd87016`

## Next Phase Readiness

- Phase 03 (Container Creation) is fully complete
- Full creation pipeline: wizard → server action → BullMQ job → worker → SSE progress → completion UI
- Ready for Phase 04 (Container Management): container list, detail pages, start/stop/delete operations
- The `/containers/[id]` route referenced in the "View Container" button does not exist yet (expected in 04-01)

## Self-Check: PASSED
