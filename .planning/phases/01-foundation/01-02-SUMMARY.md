---
phase: 01-foundation
plan: 02
subsystem: auth
tags: [middleware, route-protection, layout, sidebar, logout, undici]

# Dependency graph
requires:
  - phase: 01-foundation plan 01
    provides: iron-session, session management, login/logout server actions, login page
provides:
  - Route protection middleware (Edge-compatible)
  - Conditional layout via route groups (sidebar for dashboard, clean for login)
  - Sidebar logout button with username display
  - Complete end-to-end authentication flow
affects:
  [
    02 template system (protected routes),
    03 container creation (protected routes),
    04 container management (protected routes),
  ]

# Tech tracking
tech-stack:
  added: [undici]
  patterns:
    [
      Route group layout separation for auth vs non-auth pages,
      Edge middleware with cookie-existence check (no Redis in Edge),
      undici fetch for self-signed cert support (bypasses Next.js global fetch),
    ]

key-files:
  created:
    - apps/dashboard/src/middleware.ts
    - apps/dashboard/src/app/(dashboard)/layout.tsx
    - apps/dashboard/src/app/(dashboard)/page.tsx
  modified:
    - apps/dashboard/src/app/layout.tsx
    - apps/dashboard/src/components/app-sidebar.tsx
    - apps/dashboard/src/lib/proxmox/auth.ts
    - apps/dashboard/src/lib/proxmox/client.ts
    - apps/dashboard/src/lib/auth/actions.ts
    - apps/dashboard/.env.example
    - apps/dashboard/package.json

key-decisions:
  - "Middleware at src/middleware.ts (not project root) because project uses src/ directory"
  - "Cookie-existence check only in middleware — full Redis validation server-side (Edge can't access Redis)"
  - "Route group (dashboard) pattern separates sidebar layout from login page"
  - "undici fetch replaces global fetch for Proxmox calls — Next.js patches global fetch and strips dispatcher option"
  - "PVE_HOST/PVE_PORT env vars (matching existing .env convention) with PROXMOX_HOST/PROXMOX_PORT fallback"

patterns-established:
  - "Route group pattern: (dashboard)/ for authenticated routes, login/ outside for public routes"
  - "Middleware pattern: lightweight cookie check in Edge, full session validation server-side"
  - "undici pattern: import { fetch } from 'undici' for any fetch needing TLS config"

# Metrics
duration: 15min
completed: 2026-02-06
---

# Phase 1 Plan 2: Route Protection & Layout Summary

**Next.js middleware for route protection, route group layout separation, and sidebar logout — completing the end-to-end Proxmox SSO auth flow**

## Performance

- **Duration:** ~15 min (including orchestrator fixes)
- **Completed:** 2026-02-06
- **Tasks:** 3 (2 auto + 1 human-verify checkpoint)
- **Files modified:** 11

## Accomplishments

- Edge-compatible middleware redirects unauthenticated users to /login and authenticated users away from /login
- Route group layout: (dashboard)/ gets sidebar, login/ gets clean centered layout
- Sidebar footer displays username (root@pam) and Sign out button
- Full auth flow verified by user: login → dashboard → refresh persists → logout → redirect

## Task Commits

1. **Task 1: Next.js middleware for route protection** — `c1f233f` (feat)
2. **Task 2: Conditional layout and sidebar logout button** — `6c014f5` (feat)
3. **Task 3: Verify complete auth flow** — Human-verified ✓

### Orchestrator Fixes

- `7812cbf` — Remove .js extensions from proxmox imports (Turbopack compatibility)
- `d1af8de` — Move middleware.ts to src/ directory (Next.js detection)
- `f981e19` — Use PVE_HOST/PVE_PORT env vars matching existing .env
- `8b7cb53` — Add SESSION_SECRET to .env.example
- `ebe9f15` — Replace node:https Agent with undici dispatcher
- `7e1e005` — Use undici fetch directly to bypass Next.js global fetch patching

## Deviations from Plan

### Auto-fixed Issues

**1. [Blocking] Turbopack .js extension imports**

- Proxmox module used .js extensions in TypeScript imports — incompatible with Turbopack bundler
- Fix: Stripped .js extensions from all 36 imports across 9 files

**2. [Blocking] Middleware file location**

- Plan placed middleware at project root, but project uses src/ directory convention
- Fix: Moved to src/middleware.ts

**3. [Blocking] Env var naming mismatch**

- Plan used PROXMOX_HOST/PROXMOX_PORT but existing .env uses PVE_HOST/PVE_PORT
- Fix: Updated actions.ts to read PVE*\* with PROXMOX*\* fallback

**4. [Blocking] Node.js fetch TLS handling**

- node:https Agent doesn't work with Node 24 native fetch (undici-based)
- Next.js patches global fetch, stripping dispatcher option
- Fix: Import fetch directly from undici package, use undici Agent with rejectUnauthorized: false

---

**Total deviations:** 4 auto-fixed (all blocking)
**Impact on plan:** All pre-existing issues surfaced during integration. No scope creep.

## Issues Encountered

- Docker-in-Docker networking: Coder workspace container needed to join dashboard_default network for Redis/Postgres connectivity

## Self-Check: PASSED
