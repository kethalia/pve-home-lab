# LXC Template Manager Dashboard — Roadmap

## Overview

Full-stack web app (`apps/dashboard`) for creating, configuring, and managing LXC containers on Proxmox VE. Replaces manual shell-based workflow with a visual UI built on the existing config-manager system in `infra/lxc/`.

## Phases

### Phase 01: Foundation ✓

**Goal:** Working dev environment with database, Proxmox API client, and SSO authentication
**Status:** Complete
**Completed:** 2026-02-06
**Plans:** 2 plans

Plans:

- [x] 01-01-PLAN.md — Session infrastructure, auth server actions, and login page UI
- [x] 01-02-PLAN.md — Route protection middleware, conditional layout, and sidebar logout

---

### Phase 02: Template System ✓

**Goal:** Users can browse, view, create, and edit LXC templates with package bucket management
**Status:** Complete
**Completed:** 2026-02-06
**Plans:** 5 plans

Plans:

- [x] 02-01-PLAN.md — Template discovery engine (filesystem parser + DB sync + server action)
- [x] 02-02-PLAN.md — Template DatabaseService methods + browser page with search/filter
- [x] 02-03-PLAN.md — Package bucket CRUD (DatabaseService + server actions + management UI)
- [x] 02-04-PLAN.md — Template detail page with tabbed view (Config, Scripts, Packages, Files)
- [x] 02-05-PLAN.md — Template creator and editor forms (multi-section form with scripts/files/packages)

Issues: #76, #77, #78, #79

---

### Phase 03: Container Creation

**Goal:** Users can configure and create LXC containers through a multi-step wizard with real-time progress
**Status:** Not started
**Plans:** 4 plans

Plans:

- [ ] 03-01-PLAN.md — Infrastructure: remove server-only guards, SSH session helper, BullMQ queue setup
- [ ] 03-02-PLAN.md — Container creation engine: BullMQ worker with 5-phase pipeline
- [ ] 03-03-PLAN.md — Wizard UI: 5-step container configuration form with server action
- [ ] 03-04-PLAN.md — Progress tracking: SSE endpoint, useContainerProgress hook, progress page UI

Issues: #80, #81, #82

---

### Phase 04: Container Management

**Goal:** Users can monitor and control container lifecycle with a dashboard overview
**Status:** Not started
**Plans:** 4 plans

Plans:

- [ ] 04-01-PLAN.md — Lifecycle server actions (start/stop/shutdown/restart/delete) + DB query methods + client helper
- [ ] 04-02-PLAN.md — Service monitoring engine (SSH-based service/port/credential checks)
- [ ] 04-03-PLAN.md — Container dashboard page (summary bar, container cards, filters, auto-refresh)
- [ ] 04-04-PLAN.md — Container detail page (/containers/[id] with Overview, Services, Events tabs)

Issues: #83, #84, #85, #86

---

### Phase 05: Web UI & Monitoring

**Goal:** Service discovery with web UI access links and resource usage monitoring
**Status:** Not started
**Plans:** 0 plans

Plans:

- [ ] TBD — service discovery, resource monitoring

Issues: #87, #88

---

### Phase 06: CI/CD & Deployment

**Goal:** Docker deployment configuration and CI/CD pipeline with E2E testing
**Status:** Not started
**Plans:** 0 plans

Plans:

- [ ] TBD — Docker config, CI/CD pipeline

Issues: #89, #90

---

### Phase 07: VM to Run Openclaw

**Goal:** Extend template system to support VM templates with automated OpenClaw deployment via cloud-init
**Depends on:** Phase 06
**Plans:** 4 plans

Plans:

- [ ] 07-01-PLAN.md — Database schema extension for VM template support
- [ ] 07-02-PLAN.md — Proxmox VM API integration and configuration validation
- [ ] 07-03-PLAN.md — VM template UI components and OpenClaw template creation
- [ ] 07-04-PLAN.md — Template discovery engine and browser integration for VM templates
