# Project State

## Current Position

**Project:** LXC Template Manager Dashboard (apps/dashboard)
**Phase:** 02-template-system — Complete
**Plan:** 5 of 5 in current phase
**Status:** Phase 02 complete
**Last activity:** 2026-02-06 — Completed 02-05-PLAN.md

Progress: █████░░░░░ 47% (7/15 plans)

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

## Pending Work

- Phase 3: Container Creation (#80-82)
- Phase 4: Container Management (#83-86)
- Phase 5: Web UI & Monitoring (#87-88)
- Phase 6: CI/CD & Deployment (#89-90)

## Blockers/Concerns

- Docker-in-Docker networking: Coder workspace must join dashboard_default network for Redis/Postgres access (not localhost)

## Session Continuity

Last session: 2026-02-06T14:21:55Z
Stopped at: Completed 02-05-PLAN.md (Phase 02 complete)
Resume file: None
