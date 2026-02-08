---
phase: 03-container-creation
plan: 01
subsystem: infra
tags: [bullmq, ssh2, prisma, redis, worker, queue]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: Prisma schema, ProxmoxClient, Redis connection
  - phase: 02-template-system
    provides: DatabaseService pattern, Template model
provides:
  - SSHSession class with exec/execStreaming/uploadFile and connectWithRetry
  - BullMQ queue definition with ContainerJobData/ContainerJobResult types
  - ContainerProgressEvent type for Redis Pub/Sub progress streaming
  - DatabaseService Container/ContainerEvent/ContainerService CRUD methods
  - Shared modules importable by standalone worker process (server-only removed)
  - dev:worker and dev:all scripts for concurrent Next.js + worker development
affects: [03-02-worker, 03-03-wizard, 03-04-progress, 04-container-management]

# Tech tracking
tech-stack:
  added: [concurrently]
  patterns:
    [lazy-queue-initialization, ssh-connection-reuse, exponential-backoff-retry]

key-files:
  created:
    - apps/dashboard/src/lib/ssh.ts
    - apps/dashboard/src/lib/queue/container-creation.ts
  modified:
    - apps/dashboard/src/lib/db.ts
    - apps/dashboard/src/lib/proxmox/client.ts
    - apps/dashboard/src/lib/proxmox/containers.ts
    - apps/dashboard/src/lib/proxmox/tasks.ts
    - apps/dashboard/src/lib/proxmox/auth.ts
    - apps/dashboard/src/lib/proxmox/nodes.ts
    - apps/dashboard/src/lib/proxmox/storage.ts
    - apps/dashboard/src/lib/proxmox/templates.ts
    - apps/dashboard/src/lib/proxmox/index.ts
    - apps/dashboard/package.json

key-decisions:
  - "Removed server-only from 9 shared modules; kept in session.ts, discovery.ts, parser.ts (Next.js-only)"
  - "Lazy-initialized queue pattern (same as getRedis) to avoid creating queue on module import"
  - "connectWithRetry uses exponential backoff (2s→4s→8s→16s→32s) for new container SSH readiness"
  - "Re-exported Prisma enums (ContainerLifecycle, EventType, ServiceType, ServiceStatus) from db.ts for consumer convenience"

patterns-established:
  - "SSHSession connection-reuse: create once, exec many, close at end"
  - "getContainerCreationQueue() lazy init: queue created on first access, not on import"
  - "getProgressChannel() centralized naming: both worker and SSE use same channel pattern"

# Metrics
duration: 3min
completed: 2026-02-07
---

# Phase 03 Plan 01: Infrastructure Summary

**Remove server-only guards from shared modules, create SSHSession with connection-reuse and SFTP upload, define BullMQ queue with typed job data, and add Container/ContainerEvent/ContainerService DatabaseService methods**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-07T18:29:34Z
- **Completed:** 2026-02-07T18:33:19Z
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments

- 9 shared modules (Proxmox client, db, etc.) now importable by standalone worker process without server-only crashes
- SSHSession class provides exec, execStreaming (line-by-line callbacks), and SFTP uploadFile with connection reuse
- BullMQ queue defined with typed ContainerJobData, ContainerProgressEvent, and ContainerJobResult
- DatabaseService extended with Container CRUD, ContainerEvent audit log, and ContainerService methods for Wave 2 plans

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove server-only guards and create SSH session helper** - `762ba50` (feat)
2. **Task 2: BullMQ queue definition, types, and dev scripts** - `2fa3cc0` (feat)
3. **Task 3: Add Container, ContainerEvent, and ContainerService DatabaseService methods** - `811821d` (feat)

## Files Created/Modified

- `apps/dashboard/src/lib/ssh.ts` - SSHSession class with exec, execStreaming, uploadFile, connectWithRetry
- `apps/dashboard/src/lib/queue/container-creation.ts` - BullMQ queue, typed job data, progress channel helper
- `apps/dashboard/src/lib/db.ts` - Container/ContainerEvent/ContainerService methods + enum re-exports
- `apps/dashboard/src/lib/proxmox/client.ts` - Removed server-only import
- `apps/dashboard/src/lib/proxmox/containers.ts` - Removed server-only import
- `apps/dashboard/src/lib/proxmox/tasks.ts` - Removed server-only import
- `apps/dashboard/src/lib/proxmox/auth.ts` - Removed server-only import
- `apps/dashboard/src/lib/proxmox/nodes.ts` - Removed server-only import
- `apps/dashboard/src/lib/proxmox/storage.ts` - Removed server-only import
- `apps/dashboard/src/lib/proxmox/templates.ts` - Removed server-only import
- `apps/dashboard/src/lib/proxmox/index.ts` - Removed server-only import
- `apps/dashboard/package.json` - Added concurrently, dev:worker, dev:all scripts

## Decisions Made

- Removed server-only from 9 shared modules; kept in session.ts (Next.js-only, uses cookies), discovery.ts, parser.ts (filesystem-only modules)
- Lazy-initialized queue pattern matches existing getRedis() approach — queue created on first access, not on import
- connectWithRetry defaults: 5 attempts, 2s initial delay, exponential backoff for new container SSH readiness
- Re-exported Prisma enums from db.ts so worker and wizard can import without touching generated client directly

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All Wave 1 infrastructure ready for Wave 2 parallel plans (03-02 worker, 03-03 wizard)
- Worker can import Proxmox client, Prisma db, SSH, and queue modules
- dev:worker script registered (worker file created in Plan 02)
- DatabaseService ready for both worker and wizard consumption

---

## Self-Check: PASSED

---

_Phase: 03-container-creation_
_Completed: 2026-02-07_
