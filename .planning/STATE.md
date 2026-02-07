# Project State

## Current Position

**Project:** LXC Template Manager Dashboard (apps/dashboard)
**Phase:** 03-container-creation — In progress
**Plan:** 3 of 4 in current phase
**Status:** In progress
**Last activity:** 2026-02-07 — Completed 03-03-PLAN.md

Progress: ██████░░░░ 67% (10/15 plans)

## Completed Work

### Phase 1: Foundation (Issues #72-75) ✓

- Next.js 15 app with App Router, TypeScript, shadcn/ui, Tailwind v4
- Prisma schema with all models, Prisma client with pg adapter
- ProxmoxClient with retry logic, SSL handling, Zod validation
- iron-session v8 + Redis SSO auth, login page, route protection middleware

### Phase 2: Template System ✓

**02-01 — Template discovery engine** ✓
**02-02 — Template browser page** ✓
**02-03 — Package bucket CRUD** ✓
**02-04 — Template detail page** ✓
**02-05 — Template creator and editor forms** ✓

- DatabaseService.createTemplate/updateTemplate with atomic transactions
- createTemplateAction/updateTemplateAction with Zod validation
- TemplateForm shared component (6 sections: basics, resources, features, scripts, packages, files)
- ScriptEditor/FileEditor controlled sub-components
- /templates/new and /templates/[id]/edit pages

### Phase 3: Container Creation (In Progress)

**03-01 — Infrastructure** ✓

- Removed server-only from 9 shared modules for worker process compatibility
- SSHSession class with exec, execStreaming, uploadFile, connectWithRetry
- BullMQ queue definition with typed job data and progress events
- DatabaseService Container/ContainerEvent/ContainerService CRUD methods
- dev:worker and dev:all scripts with concurrently

**03-02 — Container creation worker** ✓

- BullMQ Worker with 5-phase pipeline: Create → Start → Deploy config-manager → Run scripts → Discover services
- Config-manager infrastructure: /etc/config-manager/, config.env, config-sync.sh, systemd service
- Real-time progress via Redis Pub/Sub + DB persistence for step/error/complete events
- Service/credential discovery from running containers → ContainerService records
- Graceful shutdown on SIGTERM/SIGINT

**03-03 — Container creation wizard UI** ✓

- 5-step wizard: Template → Configure → Packages → Scripts → Review & Deploy
- Zod validation schemas for each step with react-hook-form zodResolver
- Server action creates Container DB record + enqueues BullMQ job
- Password auto-generate (16-char) with clipboard copy
- Template selection pre-populates downstream step defaults

## Decisions Made

- Tech stack locked: Next.js 15, shadcn/ui, Tailwind v4, Prisma, PostgreSQL, Redis, BullMQ
- DatabaseService class pattern for data access + direct prisma export for transactions
- useActionState for form-based mutations, useTransition for direct server action calls
- Delete+recreate for child records (scripts/files/packages) ensures clean sync
- Tags stored as semicolon-separated string matching template.conf format
- Templates page under (dashboard) route group for sidebar layout inheritance
- Server-side filtering via URL search params for shareability
- BucketFormDialog uses mode prop (create/edit) to avoid duplicate dialog components
- Sonner toasts for all CRUD feedback; Toaster in root layout for app-wide access
- Tab components: Server Components for static display, Client Components for collapsible state
- File policy badges color-coded: replace=destructive, default=secondary, backup=outline
- Hidden JSON fields for complex nested data serialization in forms
- Bucket selection copies packages into template (template owns its package list)
- **CONVENTION: Always use shadcn/ui components** — never create custom HTML elements (badges, alerts, forms, selects, etc.) when a shadcn component exists or can be installed. Custom implementations only as last resort. Forms must use shadcn Form (react-hook-form) not raw `<form>` tags. Documented in `apps/dashboard/CLAUDE.md`. (#102)
- **CONVENTION: Cookie writes forbidden in RSC** — never call session.destroy() or modify cookies in Server Components or layouts. Cookie mutations only in Server Actions, Route Handlers, or middleware. (Next.js 16+ requirement)
- Removed server-only from shared modules (kept in session.ts, discovery.ts, parser.ts — Next.js-only)
- Lazy-initialized queue pattern for BullMQ (matches getRedis approach)
- connectWithRetry: 5 attempts, 2s initial delay, exponential backoff for SSH readiness
- Re-exported Prisma enums from db.ts for consumer convenience
- Dual Redis connections in worker: workerConnection (maxRetriesPerRequest: null) + publisher (Pub/Sub)
- Log events Redis-only; step/complete/error events persisted to ContainerEvent table
- Static IP extraction from ipConfig; DHCP discovery deferred
- Config-manager as systemd oneshot service with config.env and config-sync.sh
- Base schema pattern: split Zod schemas into base (for react-hook-form) and refined (for server validation) when using zodResolver
- Manual password confirmation in onSubmit to avoid .refine() type mismatch with zodResolver
- Template packages grouped by manager as toggle-able buckets in wizard UI

## Pending Work

- Phase 3: Container Creation — Plan 04 (#82)
- Phase 4: Container Management (#83-86)
- Phase 5: Web UI & Monitoring (#87-88)
- Phase 6: CI/CD & Deployment (#89-90)

## Blockers/Concerns

- Docker-in-Docker networking: Coder workspace must join dashboard_default network for Redis/Postgres access (not localhost)

## Accumulated Context

### Roadmap Evolution

- Phase 07 added: VM to Run OpenClaw

## Session Continuity

Last session: 2026-02-07T18:47:00Z
Stopped at: Completed 03-03-PLAN.md
Resume file: None
