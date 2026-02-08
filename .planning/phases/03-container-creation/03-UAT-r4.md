---
status: complete
phase: 03-container-creation
source: [session-fixes — auth refactor, UX improvements, bug fixes]
started: 2026-02-08T16:00:00Z
updated: 2026-02-08T16:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. No Login Required

expected: Open http://localhost:3001 in a fresh browser (or incognito). You should land directly on the dashboard — no login page, no redirect to /login. The sidebar shows "root@pam" at the bottom.
result: pass

### 2. Dropdown Ordering — Target Node

expected: Go to /containers/new, select a template (or Start from Scratch), proceed to Configure step. The Target Node dropdown lists Proxmox nodes in alphabetical order (pve-00, pve-01, pve-02, etc.).
result: pass

### 3. Dropdown Ordering — Storage, Bridge, OS Template

expected: On the Configure step, the Storage dropdown items are alphabetically sorted. Same for the Network Bridge dropdown. Same for the OS Template dropdown.
result: pass

### 4. IP/Gateway — DHCP Mode

expected: On the Configure step under Storage & Network, there's a "Use DHCP" checkbox that's checked by default. When checked, the IP Address and Gateway inputs are visible but disabled/greyed out.
result: pass

### 5. IP/Gateway — Static IP Mode

expected: Uncheck "Use DHCP". The IP Address and Gateway fields become enabled. Enter an IP like "192.168.0.60/24" and gateway "192.168.0.1". Proceed through the wizard — the Review step shows "192.168.0.60/24 / gw 192.168.0.1" in the IP Config field.
result: pass

### 2. Dropdown Ordering — Target Node

expected: Go to /containers/new, select a template (or Start from Scratch), proceed to Configure step. The Target Node dropdown lists Proxmox nodes in alphabetical order (pve-00, pve-01, pve-02, etc.).
result: [pending]

### 3. Dropdown Ordering — Storage, Bridge, OS Template

expected: On the Configure step, the Storage dropdown items are alphabetically sorted. Same for the Network Bridge dropdown. Same for the OS Template dropdown.
result: [pending]

### 4. IP/Gateway — DHCP Mode

expected: On the Configure step under Storage & Network, there's a "Use DHCP" checkbox that's checked by default. When checked, the IP Address and Gateway inputs are visible but disabled/greyed out.
result: [pending]

### 5. IP/Gateway — Static IP Mode

expected: Uncheck "Use DHCP". The IP Address and Gateway fields become enabled. Enter an IP like "192.168.0.60/24" and gateway "192.168.0.1". Proceed through the wizard — the Review step shows "192.168.0.60/24 / gw 192.168.0.1" in the IP Config field.
result: [pending]

### 6. VMID Conflict — Stale Record Cleanup

expected: If you previously created a container with VMID 600 and then destroyed it in Proxmox, entering VMID 600 again and clicking Deploy should work — the old DB record gets cleaned up automatically (no "already in use" error).
result: issue
reported: "VMID test passes, but re-creating revealed success banner shows before creation even starts — page shows Container Ready at 40% progress"
severity: major

### 7. VMID Conflict — Active Container Protected

expected: If VMID 600 currently exists as a running container in Proxmox, trying to create with VMID 600 shows an error "VMID 600 is already in use by an active container."
result: pass

### 8. Container Creation — Files Deploy Successfully

expected: Deploy a container. In the progress logs, you should NOT see errors about "failed to create file" or "No such file or directory". The config-manager.service file and other files deploy without pct push errors. Check Proxmox task log — all "Push file" tasks show OK status.
result: pass

### 9. Progress Page — Success Banner

expected: When container creation completes successfully, the progress page shows a prominent green-tinted card with a large checkmark icon, "Container Ready" title, "Your container has been created and is running" subtitle, and View Container / Create Another buttons right in the banner.
result: pass

### 10. Worker Terminal — Success Output

expected: In the terminal running the worker (pnpm dev:worker), a successful container creation prints a boxed summary with hostname, VMID, node, IP, and storage info — clearly visible as a success.
result: pass

### 7. VMID Conflict — Active Container Protected

expected: If VMID 600 currently exists as a running container in Proxmox, trying to create with VMID 600 shows an error "VMID 600 is already in use by an active container."
result: [pending]

### 8. Container Creation — Files Deploy Successfully

expected: Deploy a container. In the progress logs, you should NOT see errors about "failed to create file" or "No such file or directory". The config-manager.service file and other files deploy without pct push errors. Check Proxmox task log — all "Push file" tasks show OK status.
result: [pending]

### 9. Progress Page — Success Banner

expected: When container creation completes successfully, the progress page shows a prominent green-tinted card with a large checkmark icon, "Container Ready" title, "Your container has been created and is running" subtitle, and View Container / Create Another buttons right in the banner.
result: [pending]

### 10. Worker Terminal — Success Output

expected: In the terminal running the worker (pnpm dev:worker), a successful container creation prints a boxed summary with hostname, VMID, node, IP, and storage info — clearly visible as a success.
result: [pending]

## Summary

total: 10
passed: 9
issues: 1
pending: 0
skipped: 0

## Gaps

- truth: "Progress page should not show success until creation is actually complete"
  status: fixed
  reason: "User reported: success banner shows before creation even starts — page shows Container Ready at 40% progress"
  severity: major
  test: 6
  root_cause: "SSE snapshot route checked for DB events with type 'created' to detect completion, but the 'creating' step event also persists as EventType.created — causing false positive. Fixed by using container.lifecycle === 'ready' as sole completion signal."
  artifacts:
  - path: "apps/dashboard/src/app/api/containers/[id]/progress/route.ts"
    issue: "hasComplete check matched step events, not just completion events"
    missing:
  - "Use container.lifecycle as source of truth instead of DB event type matching"
