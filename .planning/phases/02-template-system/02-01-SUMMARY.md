---
phase: 02-template-system
plan: 01
subsystem: api
tags: [prisma, node-fs, server-actions, template-discovery, parser]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: Prisma schema with Template, TemplateScript, TemplateFile, PackageBucket, Package models and DatabaseService
provides:
  - discoverTemplates() function that scans filesystem and upserts to database
  - parseTemplateConf, parseScripts, parsePackages, parseFiles pure parser functions
  - discoverTemplatesAction server action for UI trigger
  - getDiscoveryStatus server action for sync status
  - prisma instance export from db.ts
affects: [02-02, 02-03, 02-04, 02-05, 03-01]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure parser functions with typed return values (no DB coupling)"
    - "Prisma transaction for atomic multi-model sync"
    - "Delete+recreate pattern for child records (scripts, files, packages)"
    - "Server action pattern for triggering discovery from UI"

key-files:
  created:
    - apps/dashboard/src/lib/templates/parser.ts
    - apps/dashboard/src/lib/templates/discovery.ts
    - apps/dashboard/src/lib/templates/actions.ts
  modified:
    - apps/dashboard/src/lib/db.ts

key-decisions:
  - "Parser functions are pure (no DB) — discovery.ts handles DB sync separately"
  - "Delete+recreate for child records (scripts/files/packages) ensures clean sync without orphans"
  - "Packages stored in PackageBucket with bucketId, not duplicated with templateId (templateId reserved for custom packages)"
  - "Export prisma instance directly from db.ts for complex transaction operations"
  - "Tags stored as semicolon-separated string matching template.conf format"

patterns-established:
  - "Pure parser → DB sync separation: parser.ts reads filesystem, discovery.ts writes DB"
  - "Prisma $transaction for multi-model atomic operations"
  - "Server actions as thin wrappers around business logic functions"

# Metrics
duration: 3min
completed: 2026-02-06
---

# Phase 2 Plan 1: Template Discovery Engine Summary

**Filesystem parser and Prisma-based discovery engine that scans infra/lxc/templates/, parses template.conf with bash default syntax, discovers scripts/packages/files, and idempotently upserts to database**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-06T08:22:48Z
- **Completed:** 2026-02-06T08:26:15Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Pure template parser that handles bash variable assignments with `${VAR:-default}` syntax
- Script discovery with numeric prefix ordering (00-99) and full content extraction
- Package file parsing into named buckets (base.apt, development.apt) with comment stripping
- Config file parsing with .path and .policy sidecar support
- Atomic database sync via Prisma transactions — idempotent on re-run
- Server actions for UI integration (discover + status check)

## Task Commits

Each task was committed atomically:

1. **Task 1: Template filesystem parser** - `dcf8b30` (feat)
2. **Task 2: Discovery engine and server action** - `cb9ff6e` (feat)

## Files Created/Modified

- `apps/dashboard/src/lib/templates/parser.ts` - Pure parser functions for template.conf, scripts, packages, and config files
- `apps/dashboard/src/lib/templates/discovery.ts` - Discovery engine with Prisma transaction sync
- `apps/dashboard/src/lib/templates/actions.ts` - Server actions: discoverTemplatesAction, getDiscoveryStatus
- `apps/dashboard/src/lib/db.ts` - Added prisma instance export for direct access

## Decisions Made

- Parser functions are pure (no DB) — separation allows reuse and testing without database
- Delete+recreate for child records (scripts/files/packages) ensures clean sync without orphaned records from renamed/removed files
- Packages stored in PackageBucket with bucketId; templateId on Package is reserved for custom packages added via editor
- Tags stored as semicolon-separated string to match template.conf format (TEMPLATE_TAGS uses ";")
- Export prisma instance directly from db.ts alongside DatabaseService class for complex transaction operations

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Discovery engine ready for Plan 02-02 (DatabaseService methods + browser page)
- Parser functions available for Plan 02-04 (template detail page) and Plan 02-05 (editor forms)
- Server action ready for UI integration in subsequent plans
- No blockers for next plan

---

## Self-Check: PASSED

---

_Phase: 02-template-system_
_Completed: 2026-02-06_
