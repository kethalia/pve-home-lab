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

### Phase 03: Container Creation ✓

**Goal:** Users can configure and create LXC containers through a multi-step wizard with real-time progress
**Status:** Complete
**Completed:** 2026-02-08
**Plans:** 5 plans

Plans:

- [x] 03-01-PLAN.md — Infrastructure: remove server-only guards, SSH session helper, BullMQ queue setup
- [x] 03-02-PLAN.md — Container creation engine: BullMQ worker with 5-phase pipeline
- [x] 03-03-PLAN.md — Wizard UI: 5-step container configuration form with server action
- [x] 03-04-PLAN.md — Progress tracking: SSE endpoint, useContainerProgress hook, progress page UI
- [x] 03-05-PLAN.md — Gap closure: OS template selector in wizard Configure step

Issues: #80, #81, #82

---

### Phase 03.5: Auth Refactor — Multi-User DB Credentials

**Goal:** Replace env-var Proxmox auth with multi-user DB-stored credentials managed through a Settings UI
**Status:** Not started
**Depends on:** Phase 03
**Plans:** 0 plans

Key deliverables:

- Settings page to add/edit/delete Proxmox nodes with encrypted credentials
- User authentication (local accounts or external identity provider)
- Per-user node access control
- Credentials encrypted at rest using existing `encrypt`/`decrypt` utils
- Migrate `getProxmoxClient()` to resolve credentials from DB `ProxmoxNode` records
- Remove dependency on `PVE_HOST`, `PVE_PORT`, `PVE_ROOT_PASSWORD` env vars
- `ProxmoxNode` Prisma model already has `host`, `port`, `tokenId`, `tokenSecret` fields

Plans:

- [ ] TBD

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

### Phase 07: VM to Run OpenClaw

**Goal:** Create a VM template in infra/ that provisions a Debian 13 desktop VM with XFCE, Chrome, Node.js, VNC, and OpenClaw using the ProxmoxVE community script as foundation
**Depends on:** Phase 06
**Plans:** 3 plans

Plans:

- [ ] 07-01-PLAN.md — VM template structure: template.conf, minimal cloud-init bootstrap, and create-vm.sh wrapper
- [ ] 07-02-PLAN.md — Post-install scripts (canonical software source): desktop, user, Chrome, Node.js, VNC, OpenClaw, validation
- [ ] 07-03-PLAN.md — Script runner (run-scripts.sh) and README documentation

---

### Phase 08: Proxmox LXC Container Template Engine

**Goal:** Reusable, config-driven template system that deploys fully provisioned LXC containers on Proxmox via declarative YAML config and convention-based directory structure, shipping "forge-shield" as the first template — a full-stack + EVM dev environment with GSD/OpenCode and integrated security tooling
**Depends on:** Phase 07
**Plans:** 9 plans

Plans:

- [ ] 08-01-PLAN.md — Engine library modules (logging, config, state, container, files, hooks)
- [ ] 08-02-PLAN.md — Engine deploy.sh main entry point with full deployment pipeline
- [ ] 08-03-PLAN.md — forge-shield template.yaml + base system and user creation scripts
- [ ] 08-04-PLAN.md — forge-shield language runtime scripts (Node, Python, Go, Rust)
- [ ] 08-05-PLAN.md — forge-shield EVM tools (Foundry, solc-select) + AI tools (Claude Code, OpenCode, GSD)
- [ ] 08-06-PLAN.md — forge-shield security tool scripts (web + Solidity + ZAP)
- [ ] 08-07-PLAN.md — forge-shield files/ (commands, scripts, CLAUDE.md, tmux.conf) + hooks/ + minimal/ template
- [ ] 08-08-PLAN.md — Engine README + integration verification checkpoint
- [ ] 08-09-PLAN.md — forge-shield setup scripts (Claude skills, shell config, verification)
