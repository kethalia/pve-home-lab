# Phase 03: Container Creation — Research Findings

## 1. BullMQ Workers in Next.js 15

### The Problem

BullMQ workers are long-lived processes that continuously poll Redis for jobs. Next.js is request-driven — its server process handles HTTP requests and doesn't natively support background workers. Starting a worker inside a route handler would create a new worker per request. Starting one in a module-level singleton risks being killed during HMR in dev or having lifecycle issues in production.

### Options Evaluated

#### Option A: Separate Worker Process (RECOMMENDED)

Run the worker as a standalone Node.js process alongside Next.js:

```bash
# package.json scripts
"dev": "next dev -p 3001",
"dev:worker": "tsx --watch src/workers/container-creation.ts",
"dev:all": "concurrently \"pnpm dev\" \"pnpm dev:worker\""
```

```typescript
// src/workers/container-creation.ts
import { Worker, Job } from "bullmq";
import Redis from "ioredis";

const connection = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null, // Required for BullMQ workers
});

const worker = new Worker<ContainerJobData, ContainerJobResult>(
  "container-creation",
  async (job: Job) => {
    // Process container creation
    await job.updateProgress({ step: "creating", percent: 10 });
    // ...
  },
  { connection, concurrency: 3 },
);

// Graceful shutdown
process.on("SIGTERM", async () => {
  await worker.close();
  process.exit(0);
});
```

**Pros:**

- Clean separation of concerns — worker lifecycle independent of Next.js
- Worker crashes don't affect the web server
- Can scale workers independently
- Standard BullMQ pattern used across the ecosystem
- Works identically in dev and production

**Cons:**

- Two processes to manage in dev (solved with concurrently)
- Need to add `concurrently` as a dev dependency (or use docker-compose)

#### Option B: Next.js `instrumentation.ts`

```typescript
// instrumentation.ts (project root or src/)
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Dynamically import to avoid edge runtime issues
    const { startContainerWorker } =
      await import("./lib/workers/container-creation");
    startContainerWorker();
  }
}
```

Next.js docs confirm: `register` is called **once** when a new Next.js server instance is initiated. It runs in the Node.js runtime (not Edge).

**Pros:**

- Single process, no extra tooling
- Worker starts automatically with `next dev` / `next start`

**Cons:**

- Worker is coupled to the Next.js process lifecycle
- If the Next.js process restarts (common in dev with HMR), the worker restarts too
- No way to scale workers independently
- Mixing concerns — the web server shouldn't be responsible for background processing
- In dev, `register` fires on _every_ HMR reload of the file, potentially creating duplicate workers
- In serverless/edge deployments (Vercel), this won't work at all

#### Option C: API Route that starts the worker

Not viable. Each request could spawn a new worker, and there's no guarantee of exactly-once initialization. The route would need to be hit manually. Dismissed.

### Decision: Option A (Separate Worker Process)

This is the standard BullMQ pattern. The worker file lives at `src/workers/container-creation.ts`, runs via `tsx`, and is managed as a separate process. In production, this would be a separate container or systemd service.

**Critical BullMQ requirement:** The ioredis connection used by a Worker **must** have `maxRetriesPerRequest: null`. This is different from the Queue connection (which can use defaults). BullMQ will throw if this isn't set. The existing `getRedis()` in `src/lib/redis.ts` uses `maxRetriesPerRequest: 3`, so the worker must create its own connection.

### Shared Code Architecture

The worker process needs access to:

- Prisma client (for updating Container, ContainerEvent records)
- ProxmoxClient (for creating containers, polling tasks)
- SSH2 (for post-creation deployment)
- Redis (for publishing progress)

Since the worker runs via `tsx`, it can import from `src/lib/*` directly. However, the existing Proxmox modules use `import "server-only"` which will fail outside Next.js context. Two solutions:

1. **Remove `server-only` from shared modules** — The `server-only` package only prevents client-side imports. Since the worker is server-side anyway, removing it from Proxmox modules is safe. Replace with a comment `// Server-only module`.

2. **Create a `server-only` shim** — Less ideal, adds complexity.

**Recommendation:** Remove `server-only` from modules shared with the worker, or conditionally mock it. The real safety net is that these modules aren't imported by any client components.

### Queue Setup (Shared Between Next.js + Worker)

```typescript
// src/lib/queue/container-creation.ts
import { Queue } from "bullmq";
import { getRedis } from "../redis";

export const containerCreationQueue = new Queue("container-creation", {
  connection: getRedis(),
  defaultJobOptions: {
    removeOnComplete: { count: 100 }, // Keep last 100 completed
    removeOnFail: { count: 500 }, // Keep last 500 failed
    attempts: 1, // No auto-retry for container creation
  },
});

export interface ContainerJobData {
  containerId: string; // Prisma container ID
  nodeId: string; // Proxmox node ID
  templateId: string; // Template to deploy
  config: {
    // User-configured values from wizard
    hostname: string;
    vmid: number;
    memory: number;
    swap: number;
    cores: number;
    diskSize: number;
    storage: string;
    bridge: string;
    ipConfig: string;
    nameserver?: string;
    rootPassword: string;
    sshPublicKey?: string;
    unprivileged: boolean;
    nesting: boolean;
    tags?: string;
  };
}
```

The Queue instance (for adding jobs) is used from Next.js server actions. The Worker instance (for processing) runs in the separate process.

---

## 2. Server-Sent Events (SSE) in Next.js 15 App Router

### Pattern: Route Handler with ReadableStream

SSE works via a GET route handler that returns a `ReadableStream` with the correct headers. Next.js 15 App Router fully supports this pattern.

```typescript
// app/api/containers/[id]/progress/route.ts
import { type NextRequest } from "next/server";

export const dynamic = "force-dynamic"; // Prevent caching

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "connected" })}\n\n`),
      );

      // Set up Redis subscription (see Section 3)
      const cleanup = subscribeToProgress(id, (event) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );

        if (event.type === "complete" || event.type === "error") {
          controller.close();
        }
      });

      // Handle client disconnect
      request.signal.addEventListener("abort", () => {
        cleanup();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable Nginx buffering
    },
  });
}
```

### Key Points

1. **`export const dynamic = "force-dynamic"`** — Required to prevent Next.js from trying to statically generate or cache this route.

2. **SSE format** — Each message must be `data: <payload>\n\n`. The double newline is critical.

3. **Client disconnect** — `request.signal` (AbortSignal) fires when the client closes the connection. Use it to clean up Redis subscriptions.

4. **Heartbeat** — SSE connections can be silently dropped by proxies. Send periodic keep-alive comments:

```typescript
const heartbeat = setInterval(() => {
  try {
    controller.enqueue(encoder.encode(": heartbeat\n\n"));
  } catch {
    clearInterval(heartbeat);
  }
}, 15000);
```

5. **Next.js 15 params** — In v15, `params` is a `Promise` that must be awaited. This is a breaking change from v14.

### Client-Side EventSource

```typescript
// hooks/use-container-progress.ts
"use client";

import { useEffect, useState, useCallback } from "react";

export interface ProgressEvent {
  type: "connected" | "step" | "log" | "complete" | "error";
  step?: string;
  percent?: number;
  message?: string;
  error?: string;
}

export function useContainerProgress(containerId: string | null) {
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [status, setStatus] = useState<
    "idle" | "connecting" | "streaming" | "complete" | "error"
  >("idle");

  useEffect(() => {
    if (!containerId) return;

    setStatus("connecting");
    const es = new EventSource(`/api/containers/${containerId}/progress`);

    es.onmessage = (event) => {
      const data: ProgressEvent = JSON.parse(event.data);
      setEvents((prev) => [...prev, data]);

      if (data.type === "connected") setStatus("streaming");
      if (data.type === "complete") {
        setStatus("complete");
        es.close();
      }
      if (data.type === "error") {
        setStatus("error");
        es.close();
      }
    };

    es.onerror = () => {
      setStatus("error");
      es.close();
    };

    return () => es.close();
  }, [containerId]);

  return { events, status };
}
```

### Gotchas

- **EventSource only supports GET** — This is fine since we pass the container ID in the URL.
- **No auth headers with EventSource** — The browser's EventSource API doesn't support custom headers. Auth must use cookies (which we already do — iron-session).
- **Proxy buffering** — Nginx and other reverse proxies may buffer SSE. The `X-Accel-Buffering: no` header disables Nginx buffering. For other proxies, `Cache-Control: no-transform` helps.
- **Browser reconnect** — EventSource auto-reconnects on disconnect. For a one-shot progress stream, close explicitly on completion.

---

## 3. BullMQ + Redis Pub/Sub Integration

### Architecture

```
 Next.js (Server Action)        Worker Process              Browser
 ─────────────────────         ──────────────             ──────────
       │                             │                        │
  add job to Queue ──────────> pick up job                    │
       │                             │                        │
       │                      process steps                   │
       │                             │                        │
       │                   redis.publish(channel, event) ─┐   │
       │                             │                    │   │
       │  SSE Route Handler <── redis.subscribe(channel) ─┘   │
       │        │                    │                        │
       │        └─── stream event ──────────────────────> EventSource
       │                             │                        │
       │                      job.updateProgress()            │
       │                             │                        │
```

### Worker: Publishing Progress

The worker uses a dedicated Redis connection for publishing (cannot reuse the BullMQ worker connection):

```typescript
// Inside worker process
import Redis from "ioredis";

const publisher = new Redis(process.env.REDIS_URL!);

async function publishProgress(containerId: string, event: ProgressEvent) {
  await publisher.publish(
    `container:${containerId}:progress`,
    JSON.stringify(event),
  );
}

// Usage in job processor:
async function processContainerCreation(job: Job<ContainerJobData>) {
  const { containerId } = job.data;

  await publishProgress(containerId, {
    type: "step",
    step: "creating",
    percent: 10,
    message: "Creating LXC container on Proxmox...",
  });

  // ... create container via Proxmox API ...

  await publishProgress(containerId, {
    type: "step",
    step: "starting",
    percent: 40,
    message: "Starting container...",
  });

  // ... and so on
}
```

### SSE Route: Subscribing to Progress

The SSE route handler creates a dedicated ioredis subscriber connection:

```typescript
// Used in SSE route handler
function subscribeToProgress(
  containerId: string,
  onEvent: (event: ProgressEvent) => void,
): () => void {
  const subscriber = new Redis(process.env.REDIS_URL!);
  const channel = `container:${containerId}:progress`;

  subscriber.subscribe(channel);

  subscriber.on("message", (ch, message) => {
    if (ch === channel) {
      onEvent(JSON.parse(message));
    }
  });

  // Return cleanup function
  return () => {
    subscriber.unsubscribe(channel);
    subscriber.quit();
  };
}
```

### Why Redis Pub/Sub Instead of BullMQ Events?

BullMQ has its own event system (`QueueEvents`) that listens for job progress. However:

1. **QueueEvents uses Redis Streams** — More persistent but heavier. We need lightweight real-time notifications.
2. **QueueEvents is per-queue, not per-job** — We'd need to filter by job ID for each SSE connection.
3. **Custom events are richer** — We want structured events (step name, percentage, log lines) beyond what `job.updateProgress()` provides.
4. **Redis Pub/Sub is at-most-once** — Perfect for progress events. If a subscriber misses an event (disconnect), they can query the current state from DB.

**Hybrid approach:** Use both:

- `job.updateProgress()` for BullMQ's built-in progress tracking (queryable via `job.progress`)
- `redis.publish()` for real-time SSE streaming (fire-and-forget)
- Prisma `ContainerEvent` for persistent audit log

### Connection Pooling Concern

Each SSE connection creates a dedicated ioredis subscriber. ioredis subscribers enter "subscriber mode" and can't run other commands. This means:

- 10 concurrent SSE connections = 10 Redis connections
- Redis default max connections: 10,000

For a home lab dashboard with <10 concurrent users, this is negligible. For scale, you'd use a single shared subscriber with a message router (but that's premature optimization for this use case).

### Missed Events / Late Subscriber

If the browser connects _after_ some progress events have already been published, those events are lost (Pub/Sub is fire-and-forget). Solutions:

1. **On SSE connect, query current state from DB** — The worker writes each step to `ContainerEvent` table. The SSE route reads existing events first, then subscribes for new ones.

```typescript
// In SSE route, before subscribing:
const existingEvents = await prisma.containerEvent.findMany({
  where: { containerId: id },
  orderBy: { createdAt: "asc" },
});

// Send existing events as initial batch
for (const event of existingEvents) {
  controller.enqueue(
    encoder.encode(`data: ${JSON.stringify(formatEvent(event))}\n\n`)
  );
}

// Then subscribe for new events
const cleanup = subscribeToProgress(id, (event) => { ... });
```

2. **Also check container lifecycle status** — If `container.lifecycle === "ready"`, send a complete event immediately without subscribing.

---

## 4. SSH2 in Node.js — Patterns for Container Deployment

### Connection & Command Execution

The `ssh2` library (v1.17.0, already installed) provides a `Client` class:

```typescript
import { Client as SSHClient } from "ssh2";

interface SSHExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

function sshExec(
  config: { host: string; port?: number; username: string; password: string },
  command: string,
): Promise<SSHExecResult> {
  return new Promise((resolve, reject) => {
    const conn = new SSHClient();

    conn
      .on("ready", () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end();
            return reject(err);
          }

          let stdout = "";
          let stderr = "";

          stream
            .on("close", (code: number) => {
              conn.end();
              resolve({ stdout, stderr, code });
            })
            .on("data", (data: Buffer) => {
              stdout += data.toString();
            })
            .stderr.on("data", (data: Buffer) => {
              stderr += data.toString();
            });
        });
      })
      .on("error", reject)
      .connect({
        host: config.host,
        port: config.port ?? 22,
        username: config.username,
        password: config.password,
        readyTimeout: 10000,
      });
  });
}
```

### Streaming Output in Real-Time

For progress tracking, we need to stream stdout/stderr as they arrive rather than buffering:

```typescript
function sshExecStreaming(
  config: { host: string; port: number; username: string; password: string },
  command: string,
  onOutput: (line: string, isStderr: boolean) => void,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const conn = new SSHClient();

    conn
      .on("ready", () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end();
            return reject(err);
          }

          stream
            .on("close", (code: number) => {
              conn.end();
              resolve(code);
            })
            .on("data", (data: Buffer) => {
              const lines = data.toString().split("\n").filter(Boolean);
              lines.forEach((line) => onOutput(line, false));
            })
            .stderr.on("data", (data: Buffer) => {
              const lines = data.toString().split("\n").filter(Boolean);
              lines.forEach((line) => onOutput(line, true));
            });
        });
      })
      .on("error", reject)
      .connect(config);
  });
}
```

### File Upload via SFTP

For deploying template files to the container:

```typescript
function sshUploadFile(
  config: { host: string; port: number; username: string; password: string },
  content: string,
  remotePath: string,
  mode?: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const conn = new SSHClient();

    conn
      .on("ready", () => {
        conn.sftp((err, sftp) => {
          if (err) {
            conn.end();
            return reject(err);
          }

          const writeStream = sftp.createWriteStream(remotePath, {
            mode: mode ?? 0o644,
          });

          writeStream.on("close", () => {
            conn.end();
            resolve();
          });

          writeStream.on("error", (err: Error) => {
            conn.end();
            reject(err);
          });

          writeStream.end(content);
        });
      })
      .on("error", reject)
      .connect(config);
  });
}
```

### Connection Reuse Pattern

Opening a new SSH connection per command is expensive (~200-500ms handshake). For multi-step deployment, reuse the connection:

```typescript
class SSHSession {
  private conn: SSHClient;
  private ready: Promise<void>;

  constructor(config: {
    host: string;
    port?: number;
    username: string;
    password: string;
  }) {
    this.conn = new SSHClient();
    this.ready = new Promise((resolve, reject) => {
      this.conn
        .on("ready", resolve)
        .on("error", reject)
        .connect({
          host: config.host,
          port: config.port ?? 22,
          username: config.username,
          password: config.password,
          readyTimeout: 10000,
        });
    });
  }

  async exec(command: string): Promise<SSHExecResult> {
    await this.ready;
    return new Promise((resolve, reject) => {
      this.conn.exec(command, (err, stream) => {
        if (err) return reject(err);
        let stdout = "";
        let stderr = "";
        stream
          .on("close", (code: number) => resolve({ stdout, stderr, code }))
          .on("data", (data: Buffer) => {
            stdout += data.toString();
          })
          .stderr.on("data", (data: Buffer) => {
            stderr += data.toString();
          });
      });
    });
  }

  async execStreaming(
    command: string,
    onOutput: (line: string, isStderr: boolean) => void,
  ): Promise<number> {
    await this.ready;
    return new Promise((resolve, reject) => {
      this.conn.exec(command, (err, stream) => {
        if (err) return reject(err);
        stream
          .on("close", (code: number) => resolve(code))
          .on("data", (data: Buffer) => {
            data
              .toString()
              .split("\n")
              .filter(Boolean)
              .forEach((l) => onOutput(l, false));
          })
          .stderr.on("data", (data: Buffer) => {
            data
              .toString()
              .split("\n")
              .filter(Boolean)
              .forEach((l) => onOutput(l, true));
          });
      });
    });
  }

  async uploadFile(
    content: string,
    remotePath: string,
    mode?: number,
  ): Promise<void> {
    await this.ready;
    return new Promise((resolve, reject) => {
      this.conn.sftp((err, sftp) => {
        if (err) return reject(err);
        const ws = sftp.createWriteStream(remotePath, { mode: mode ?? 0o644 });
        ws.on("close", resolve);
        ws.on("error", reject);
        ws.end(content);
      });
    });
  }

  close() {
    this.conn.end();
  }
}

// Usage in worker:
const ssh = new SSHSession({ host: containerIp, username: "root", password });
try {
  await ssh.exec("apt-get update");
  await ssh.uploadFile(scriptContent, "/tmp/setup.sh", 0o755);
  const code = await ssh.execStreaming("bash /tmp/setup.sh", (line, isErr) => {
    publishProgress(containerId, { type: "log", message: line });
  });
  if (code !== 0) throw new Error(`Script failed with exit code ${code}`);
} finally {
  ssh.close();
}
```

### SSH Into Proxmox vs Into Container

There are two SSH targets in the workflow:

1. **Proxmox host** — For operations not available via API (e.g., `pct exec`, pushing files into containers from the host)
2. **Container directly** — Once the container has networking, SSH directly into it

For the container creation workflow, the Proxmox API handles container creation. Post-creation setup (installing packages, deploying files, running scripts) can be done via:

- **Option A:** SSH into Proxmox host + `pct exec <vmid> -- <command>` — Works even before container has networking
- **Option B:** SSH directly into container — Requires container to have networking and SSH server running

**Recommendation:** Use Proxmox API for creation, then SSH into the container directly for deployment (templates include SSH server setup). Fall back to `pct exec` via Proxmox host SSH if container networking isn't ready.

### Gotchas

- **ssh2 `readyTimeout`** — Default is 20s. Set appropriately for slow containers.
- **Connection refused on new containers** — SSH server takes a few seconds to start after boot. Retry with backoff.
- **`server-only` import** — The ssh2 module works fine outside Next.js. Don't gate it behind `server-only`.
- **Buffer handling** — `data` events emit `Buffer`, not `string`. Always call `.toString()`.
- **Large output** — For commands that produce lots of output, consider throttling progress events (e.g., batch log lines, send every 500ms).

---

## 5. Multi-Step Wizard State Management

### Options Evaluated

#### Option A: React useState with Parent Container (RECOMMENDED)

```typescript
// app/(dashboard)/containers/new/page.tsx (Client Component)
"use client";

import { useState } from "react";

interface WizardState {
  step: number;
  template: { id: string; name: string } | null;
  resources: { memory: number; swap: number; cores: number; diskSize: number; storage: string } | null;
  network: { bridge: string; ipConfig: string; nameserver: string } | null;
  access: { hostname: string; rootPassword: string; sshPublicKey: string } | null;
}

const initialState: WizardState = {
  step: 1,
  template: null,
  resources: null,
  network: null,
  access: null,
};

export default function NewContainerPage() {
  const [state, setState] = useState<WizardState>(initialState);

  const updateStep = (step: number, data: Partial<WizardState>) => {
    setState((prev) => ({ ...prev, ...data, step }));
  };

  switch (state.step) {
    case 1: return <TemplateStep data={state.template} onNext={(d) => updateStep(2, { template: d })} />;
    case 2: return <ResourceStep data={state.resources} onNext={(d) => updateStep(3, { resources: d })} onBack={() => updateStep(1, {})} />;
    case 3: return <NetworkStep data={state.network} onNext={(d) => updateStep(4, { network: d })} onBack={() => updateStep(2, {})} />;
    case 4: return <AccessStep data={state.access} onNext={(d) => updateStep(5, { access: d })} onBack={() => updateStep(3, {})} />;
    case 5: return <ReviewStep state={state} onBack={() => updateStep(4, {})} />;
  }
}
```

**Pros:**

- Simple, no extra dependencies
- State preserved on back/forward navigation within the wizard
- Each step component receives typed data
- Easy to validate per step (each step component uses its own Zod schema)
- React 19 compatible

**Cons:**

- State lost on page refresh (acceptable for a creation wizard)
- All in one client component tree

#### Option B: useReducer for Complex State

```typescript
type WizardAction =
  | { type: "SET_TEMPLATE"; payload: TemplateData }
  | { type: "SET_RESOURCES"; payload: ResourceData }
  | { type: "SET_NETWORK"; payload: NetworkData }
  | { type: "SET_ACCESS"; payload: AccessData }
  | { type: "GO_TO_STEP"; payload: number };

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "SET_TEMPLATE":
      return { ...state, template: action.payload, step: 2 };
    // ...
  }
}
```

**Pros:**

- More structured for complex state transitions
- Easier to test state logic in isolation

**Cons:**

- More boilerplate for a 5-step wizard
- useState is sufficient for this complexity level

#### Option C: URL Search Params

```
/containers/new?step=2&templateId=abc
```

**Pros:**

- Shareable/bookmarkable URLs
- Browser back/forward works naturally

**Cons:**

- Sensitive data (password) can't go in URL
- Complex state (objects) is awkward to serialize
- Step navigation feels janky with URL updates

#### Option D: Zustand / Client State Library

**Dismissed** — Adding a client state library for a single wizard is overkill. useState covers this.

### Decision: Option A (useState)

For 5 steps with well-defined data shapes, `useState` is the right tool. A `useReducer` could be used if the state transitions become more complex, but it's unlikely for a linear wizard.

### Wizard UX Patterns

#### Step Progress Indicator

```
Template > Resources > Network > Access > Review
   [1]        [2]        [3]       [4]      [5]
   ===        ---        ---       ---      ---
```

A horizontal stepper showing current step, completed steps (checkmark), and remaining steps.

#### Per-Step Validation

Each step validates its own data with Zod before allowing "Next":

```typescript
// Step components use local form state + Zod validation
const ResourceSchema = z.object({
  memory: z.number().min(128).max(65536),
  swap: z.number().min(0).max(65536),
  cores: z.number().min(1).max(128),
  diskSize: z.number().min(1).max(10240),
  storage: z.string().min(1),
});
```

#### Data Loading in Steps

- **Step 1 (Template Selection):** Needs server data (templates list). Use a server component wrapper or fetch in useEffect.
- **Step 2 (Resources):** Pre-populate from template defaults. Pure client state.
- **Step 3 (Network):** Needs server data (available bridges, next VMID). Fetch on mount.
- **Step 4 (Access):** Pure client state (hostname, password, SSH key).
- **Step 5 (Review):** Pure display of collected state.

Since the page is a client component, server data should be passed via:

- Props from a server component parent that fetches the initial data
- Or fetched via server actions called from useEffect/onMount

**Recommended pattern:**

```typescript
// app/(dashboard)/containers/new/page.tsx (Server Component)
import { getTemplates } from "@/lib/actions/templates";
import { getNextVmid, getBridges } from "@/lib/actions/proxmox";
import { ContainerWizard } from "./container-wizard";

export default async function NewContainerPage() {
  const [templates, nextVmid, bridges] = await Promise.all([
    getTemplates(),
    getNextVmid(),
    getBridges(),
  ]);

  return <ContainerWizard templates={templates} nextVmid={nextVmid} bridges={bridges} />;
}
```

This keeps the page as a server component that passes initial data to the client wizard component.

---

## Summary of Recommendations

| Concern                      | Recommendation                                  | Key Reason                                                 |
| ---------------------------- | ----------------------------------------------- | ---------------------------------------------------------- |
| BullMQ worker                | Separate process via `tsx`                      | Clean separation, independent lifecycle, standard pattern  |
| SSE streaming                | Route handler + ReadableStream                  | Native Next.js 15 pattern, no dependencies                 |
| Progress channel             | Redis Pub/Sub                                   | Lightweight, real-time, perfect for fire-and-forget events |
| Progress persistence         | Prisma ContainerEvent                           | Handles late subscribers, audit trail                      |
| SSH execution                | `ssh2` with connection reuse (SSHSession class) | Avoid reconnection overhead during multi-step deploy       |
| Wizard state                 | React useState in client component              | Simple, sufficient, no extra dependencies                  |
| Server data for wizard       | Server component parent with async data fetch   | Leverages Next.js App Router SSR                           |
| Worker ↔ Next.js shared code | Remove `server-only` from shared modules        | Worker is already server-side                              |

## Potential Pitfalls

1. **BullMQ `maxRetriesPerRequest: null`** — Must be set on the Worker's Redis connection. Forgetting this causes a runtime crash.
2. **SSE proxy buffering** — Must send `X-Accel-Buffering: no` header.
3. **Redis subscriber mode** — A subscriber connection can't run regular commands. Need separate connections for publish and subscribe.
4. **Container SSH readiness** — New containers need time to start SSH. Implement retry with exponential backoff (e.g., 5 attempts, 2s → 4s → 8s).
5. **`server-only` in shared code** — Worker process can't import modules with `server-only`. Must remove or shim.
6. **HMR in dev** — If using instrumentation.ts (we're not), the worker would restart on every code change. Separate process avoids this.
7. **SSE auto-reconnect** — EventSource auto-reconnects by default. For a one-shot progress stream, explicitly close on completion/error to prevent reconnect loops.
8. **Large SSH output** — Throttle/batch log lines published to Redis. Don't publish per-byte; publish per-line or per-interval.
