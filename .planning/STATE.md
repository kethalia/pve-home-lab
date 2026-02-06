# Project State

## Current Position

**Project:** LXC Template Manager Dashboard (apps/dashboard)
**Phase:** 02-template-system — In progress
**Plan:** 3 of 5 in current phase
**Status:** Completed 02-03-PLAN.md
**Last activity:** 2026-02-06 — Completed 02-03-PLAN.md

Progress: ███░░░░░░░ 33% (5/15 plans)

## Completed Work

### Phase 1: Foundation (Issues #72-75) ✓

- Next.js 15 app with App Router, TypeScript, shadcn/ui, Tailwind v4
- Prisma schema with all models, Prisma client with pg adapter
- ProxmoxClient with retry logic, SSL handling, Zod validation
- iron-session v8 + Redis SSO auth, login page, route protection middleware

### Phase 2: Template System — In Progress

**02-01 — Template discovery engine** ✓

- Pure filesystem parser (template.conf, scripts, packages, config files with sidecars)
- Prisma-based discovery engine with atomic transaction sync
- Server actions: discoverTemplatesAction, getDiscoveryStatus
- prisma instance exported from db.ts for complex operations

**02-02 — Template browser page** ✓

- DatabaseService template query methods (list, getById, getTags, count, delete)
- /templates page with card grid, search, tag filtering, discovery button
- TemplateCard, TemplateSearch, DiscoverButton components
- Loading skeleton, empty state, no-results state

**02-03 — Package bucket CRUD** ✓

- DatabaseService PackageBucket/Package CRUD (9 methods)
- Server actions with Zod validation for bucket and package mutations
- /templates/packages management page with bucket cards, create/edit dialogs
- Inline package add/remove, bulk import from .apt content
- Sonner toast notifications infrastructure in root layout

## Decisions Made

- Tech stack locked: Next.js 15, shadcn/ui, Tailwind v4, Prisma, PostgreSQL, Redis, BullMQ
- Proxmox auth via ticket-based SSO (not API tokens for user sessions)
- Container lifecycle enum: `creating/ready/error`
- AES-256-GCM encryption for sensitive fields
- DatabaseService class pattern for data access + direct prisma export for transactions
- Port 3001 for dev server
- Cookie stores only session ID — session data in Redis with 2h TTL
- iron-session v8, undici fetch, Edge middleware cookie-existence check
- Pure parser → DB sync separation: parser.ts reads filesystem, discovery.ts writes DB
- Delete+recreate for child records (scripts/files/packages) ensures clean sync
- Packages in PackageBucket with bucketId; templateId reserved for custom packages
- Tags stored as semicolon-separated string matching template.conf format
- Templates page under (dashboard) route group for sidebar layout inheritance
- Server-side filtering via URL search params for shareability
- Tag filtering uses AND logic (template must contain ALL selected tags)
- BucketFormDialog uses mode prop (create/edit) to avoid duplicate dialog components
- Sonner toasts for all CRUD feedback; Toaster in root layout for app-wide access
- useActionState for form-based mutations, useTransition for direct server action calls

## Pending Work

- Phase 2: Plans 02-04 through 02-05 (template detail page, editor)
- Phase 3: Container Creation (#80-82)
- Phase 4: Container Management (#83-86)
- Phase 5: Web UI & Monitoring (#87-88)
- Phase 6: CI/CD & Deployment (#89-90)

## Blockers/Concerns

- Docker-in-Docker networking: Coder workspace must join dashboard_default network for Redis/Postgres access (not localhost)

## Session Continuity

Last session: 2026-02-06T08:42:05Z
Stopped at: Completed 02-03-PLAN.md
Resume file: None
