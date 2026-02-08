---
phase: 03-container-creation
plan: 02
subsystem: worker
tags:
  [
    bullmq,
    worker,
    ssh,
    proxmox,
    redis-pubsub,
    service-discovery,
    config-manager,
  ]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: Prisma schema, ProxmoxClient, encryption
  - phase: 02-template-system
    provides: DatabaseService pattern, Template model with scripts/files/packages
  - plan: 03-01
    provides: SSHSession, BullMQ queue types, Container DatabaseService methods
provides:
  - BullMQ Worker process with 5-phase container creation pipeline
  - Config-manager infrastructure deployment (dirs, config.env, sync script, systemd service)
  - Real-time progress via Redis Pub/Sub with DB persistence for audit
  - Service and credential discovery from running containers
  - Graceful shutdown on SIGTERM/SIGINT
affects: [03-04-progress-sse, 04-container-management]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [
      five-phase-pipeline,
      redis-pubsub-progress,
      ssh-config-deployment,
      service-discovery,
      dual-redis-connections,
    ]

key-files:
  created:
    - apps/dashboard/src/workers/container-creation.ts
  modified: []

key-decisions:
  - "Dual Redis connections: workerConnection (maxRetriesPerRequest: null for BullMQ) + publisher (for Pub/Sub)"
  - "Log events published to Redis only (real-time); step/complete/error events persisted to DB (audit trail)"
  - "Static IP extraction from ipConfig; DHCP discovery deferred with clear error message"
  - "Config-manager deployed as systemd oneshot service with config.env, config-sync.sh, and unit file"
  - "Service discovery filters out system services (systemd-*, ssh, cron, dbus, getty) keeping only application services"
  - "Credentials read from /etc/infrahaus/credentials/ directory, encrypted before DB storage"

patterns-established:
  - "5-phase pipeline: Create → Start → Deploy → Sync/Scripts → Discover/Finalize"
  - "publishProgress helper: dual-channel (Redis Pub/Sub + DB) with event-type filtering"
  - "Config-manager infrastructure: /etc/config-manager/ + /etc/infrahaus/ + systemd service"

# Metrics
duration: 4min
completed: 2026-02-07
---

# Phase 03 Plan 02: Container Creation Worker Summary

**BullMQ worker with 5-phase pipeline: create LXC via Proxmox API, start container, deploy config-manager infrastructure + template files via SSH, run sync + template scripts, discover services/credentials and finalize lifecycle**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-07T18:36:43Z
- **Completed:** 2026-02-07T18:40:43Z
- **Tasks:** 1
- **Files created:** 1 (712 lines)

## Accomplishments

- BullMQ Worker process with concurrency 2, processing container creation jobs from the `container-creation` queue
- Phase 1-2: Creates and starts LXC container via Proxmox API with task polling (waitForTask with configurable timeouts)
- Phase 3: Deploys config-manager infrastructure (directory structure, config.env, config-sync.sh, systemd service) and template files via SSH
- Phase 4: Runs config-manager initial sync, then executes all enabled template scripts with streaming output
- Phase 5: Discovers running services (systemd), listening ports (ss), and credentials (/etc/infrahaus/credentials/), creates ContainerService records
- Real-time progress events published to Redis Pub/Sub channel `container:<id>:progress`
- Step/complete/error events persisted as ContainerEvent records for late-subscriber replay
- Container lifecycle transitions: creating → ready on success, creating → error on failure
- Graceful shutdown on SIGTERM/SIGINT closes worker, publisher, and Redis connections

## Task Commits

Each task was committed atomically:

1. **Task 1: Container creation worker with 5-phase pipeline** - `3fada04` (feat)

## Files Created/Modified

- `apps/dashboard/src/workers/container-creation.ts` - BullMQ worker with 5-phase pipeline (712 lines)

## Decisions Made

- Dual Redis connections: workerConnection with `maxRetriesPerRequest: null` (BullMQ requirement) and publisher for Pub/Sub
- Log events are Redis-only (fire-and-forget for real-time display); step/complete/error events are persisted to ContainerEvent table
- Static IP extraction via regex on ipConfig string; DHCP discovery deferred with descriptive error
- Config-manager deployed as systemd oneshot service: `/etc/config-manager/config.env`, `/usr/local/bin/config-sync.sh`, `/etc/systemd/system/config-manager.service`
- Service discovery excludes system services (ssh, cron, dbus, systemd-\*, getty); keeps application services
- Credential files from `/etc/infrahaus/credentials/` are encrypted via AES-256-GCM before DB storage

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - worker is started via existing `pnpm dev:worker` script from plan 03-01.

## Next Phase Readiness

- Worker is ready to process jobs enqueued by the creation wizard (03-03)
- Progress events ready for SSE consumption (03-04)
- ContainerService records ready for container management UI (Phase 04)

---

## Self-Check: PASSED

---

_Phase: 03-container-creation_
_Completed: 2026-02-07_
