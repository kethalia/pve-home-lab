# Project State

## Current Position

**Project:** LXC Template Manager Dashboard (apps/dashboard)
**Phase:** 01-foundation — COMPLETE
**Status:** Phase 1 complete, Phase 2-6 not started

Progress: ██░░░░░░░░ 17% (1/6 phases)

## Completed Work

### Phase 1: Foundation (Issues #72-75) ✓

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
- Uses undici fetch for self-signed cert support

**#75 — Proxmox SSO authentication** ✓

- iron-session v8 + Redis-backed session management (cookie stores session ID, ticket in Redis with 2h TTL)
- Login/logout server actions with Zod validation
- Login page at /login with React 19 useActionState pattern
- Edge-compatible route protection middleware
- Route group layout: (dashboard)/ with sidebar, login/ without
- Sidebar footer with username display and Sign out button
- Full auth flow verified: login → dashboard → persist on refresh → logout

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
- undici fetch for all Proxmox API calls (bypasses Next.js global fetch patching for self-signed certs)
- PVE_HOST/PVE_PORT env vars (with PROXMOX_HOST/PROXMOX_PORT fallback)
- Route group pattern for auth layout separation
- Edge middleware: cookie-existence check only (no Redis in Edge runtime)

## Pending Work

- Phase 2: Template System (#76-79)
- Phase 3: Container Creation (#80-82)
- Phase 4: Container Management (#83-86)
- Phase 5: Web UI & Monitoring (#87-88)
- Phase 6: CI/CD & Deployment (#89-90)

## Blockers/Concerns

- Docker-in-Docker networking: Coder workspace must join dashboard_default network for Redis/Postgres access (not localhost)

## Session Continuity

Last session: 2026-02-06
Stopped at: Phase 01 complete
Resume file: None
