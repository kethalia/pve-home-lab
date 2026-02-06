# Project State

## Current Position

**Project:** LXC Template Manager Dashboard (apps/dashboard)
**Phase:** 1 of 6 (01-foundation)
**Plan:** 1 of 2 in current phase
**Status:** In progress
**Last activity:** 2026-02-06 - Completed 01-01-PLAN.md

Progress: █░░░░░░░░░ 8% (1/12 plans — only 2 planned so far)

## Completed Work

### Phase 1: Foundation (Issues #72-75)

**#72 — Scaffold Next.js dashboard app** ✓

- Next.js 15 app at `apps/dashboard` with App Router, TypeScript
- shadcn/ui installed (Button, Card, Input, Sidebar, Separator, Sheet, Tooltip, Skeleton)
- Tailwind CSS v4 configured
- Prisma ORM, ioredis, BullMQ, ssh2, zod all installed
- docker-compose.dev.yaml for PostgreSQL + Redis
- Dev server on port 3001
- Basic sidebar layout with navigation (Dashboard, Templates, Containers, Settings)
- Vitest test setup

**#73 — Database schema** ✓

- Full Prisma schema with all models, enums, migrations
- Encryption utility (AES-256-GCM) for sensitive fields
- DatabaseService class with ProxmoxNode CRUD operations
- Prisma client with pg adapter and connection pooling

**#74 — Proxmox VE API client** ✓

- ProxmoxClient class with retry logic, SSL handling, Zod schema validation
- Auth, container, task, node, storage, template operations
- Typed error classes

**#75 — Proxmox SSO authentication** ⟳ IN PROGRESS (Plan 01-01 complete, Plan 01-02 remaining)

- ✓ iron-session + Redis-backed session management
- ✓ Login/logout server actions with Zod validation
- ✓ Login page UI at /login with React 19 useActionState
- ✗ Route protection middleware (Plan 01-02)
- ✗ Conditional layout / sidebar logout (Plan 01-02)

## Decisions Made

- Tech stack locked per Epic #71: Next.js 15, shadcn/ui, Tailwind v4, Prisma, PostgreSQL, Redis, BullMQ
- Proxmox auth via ticket-based SSO (not API tokens for user sessions)
- Container lifecycle enum uses `creating/ready/error` (not `running/stopped`)
- AES-256-GCM encryption for sensitive fields
- DatabaseService class pattern for data access
- Port 3001 for dev server
- Cookie stores only session ID, not Proxmox ticket — session data in Redis with 2h TTL
- iron-session v8 CookieStore API for Next.js App Router compatibility
- Generic error messages to client — no Proxmox error detail leakage

## Pending Work

- Phase 1 completion: Plan 01-02 (middleware, conditional layout, logout)
- Phase 2: Template System (#76-79)
- Phase 3: Container Creation (#80-82)
- Phase 4: Container Management (#83-86)
- Phase 5: Web UI & Monitoring (#87-88)
- Phase 6: CI/CD & Deployment (#89-90)

## Blockers/Concerns

- None currently

## Session Continuity

Last session: 2026-02-06T05:52:57Z
Stopped at: Completed 01-01-PLAN.md
Resume file: None
