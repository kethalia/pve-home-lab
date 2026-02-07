---
phase: 07-vm-to-run-openclaw
plan: 03B
type: execute
wave: 3
depends_on: ["02"]
files_modified:
  [
    "apps/dashboard/src/lib/templates/vm-integration.ts",
    "infra/vm-templates/openclaw/template.conf",
    "infra/vm-templates/openclaw/cloud-init/vendor-data.yaml",
    "infra/vm-templates/openclaw/cloud-init/user-data.yaml",
  ]
autonomous: true

must_haves:
  truths:
    - "Users can deploy VM templates with automated OpenClaw installation via cloud-init"
    - "OpenClaw VM template automates complete Node.js + Docker setup"
  artifacts:
    - path: "apps/dashboard/src/lib/templates/vm-integration.ts"
      provides: "VM template validation to Proxmox API integration"
      exports: ["validateAndCreateVM", "validateAndCreateVMTemplate"]
    - path: "infra/vm-templates/openclaw/cloud-init/vendor-data.yaml"
      provides: "OpenClaw automated installation"
      contains: "curl.*openclaw.*install"
  key_links:
    - from: "apps/dashboard/src/lib/templates/vm-integration.ts"
      to: "Plan 02 Proxmox VM API"
      via: "import and function calls"
      pattern: "import.*vms.*createVM"
---

<objective>
Create a production-ready OpenClaw VM template with cloud-init automation and integrate VM template validation with Proxmox API.

Purpose: Provide an OpenClaw template ready for deployment with cloud-init automation and wire VM template validation to the Proxmox API integration layer.
Output: OpenClaw VM template with automated Node.js setup and VM template validation integration.
</objective>

<execution_context>
@/home/coder/.config/Claude/get-shit-done/workflows/execute-plan.md
@/home/coder/.config/Claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/07-vm-to-run-openclaw/07-RESEARCH.md
@.planning/phases/07-vm-to-run-openclaw/07-01-SUMMARY.md
@.planning/phases/07-vm-to-run-openclaw/07-02-SUMMARY.md
@apps/dashboard/CLAUDE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create OpenClaw VM template with cloud-init automation</name>
  <files>infra/vm-templates/openclaw/template.conf, infra/vm-templates/openclaw/cloud-init/vendor-data.yaml, infra/vm-templates/openclaw/cloud-init/user-data.yaml</files>
  <action>
    Create production-ready OpenClaw VM template following research patterns:
    
    template.conf (similar to LXC template.conf):
    1. Template metadata: name, description, tags
    2. VM defaults: 4GB RAM, 2 cores, 32GB disk, Ubuntu 24.04
    3. UEFI settings: ovmf bios, q35 machine, virtio-scsi storage
    4. Network: vmbr0 bridge with DHCP
    5. Cloud-init storage configuration
    
    vendor-data.yaml:
    1. OpenClaw installation automation per research:
       - Update system packages
       - Install Node.js 22+ via NodeSource repository
       - Install Docker and add openclaw user to docker group
       - Download and install OpenClaw via official installer script
       - Configure OpenClaw as systemd service
       - Set up basic firewall rules (SSH, OpenClaw ports)
    
    user-data.yaml:
    1. Basic cloud-init user configuration:
       - Create openclaw user with sudo access
       - SSH key injection (templated)
       - Disable root SSH, enable SSH for openclaw user
       - Set hostname and locale
    
    Follow cloud-init best practices from research. Installation script must be idempotent.
  </action>
  <verify>YAML files pass cloud-init validation, template.conf follows established patterns</verify>
  <done>OpenClaw VM template ready for automated deployment with Node.js 22+ and Docker support</done>
</task>

<task type="auto">
  <name>Task 2: Wire VM template validation to Proxmox API integration</name>
  <files>apps/dashboard/src/lib/templates/vm-integration.ts</files>
  <action>
    Create integration layer connecting VM template validation to Proxmox API calls:
    
    1. Import VMCreateConfigSchema from Plan 02 schemas
    2. Import createVM, createVMTemplate functions from Plan 02 vms.ts
    3. Create validateAndCreateVM function:
       - Validates VM template config using VMCreateConfigSchema
       - Transforms validated data to Proxmox VM creation format
       - Calls createVM from vms.ts with proper parameters
       - Handles validation errors and API errors consistently
    4. Create validateAndCreateVMTemplate function:
       - Validates template configuration
       - Calls createVMTemplate from vms.ts
       - Returns template creation result
    5. Export functions for use in template creation server actions
    
    This wires the validation schemas from Plan 02 to actual VM creation functionality,
    ensuring form validation aligns with Proxmox API requirements.
  </action>
  <verify>Integration functions validate VM configs and successfully call Proxmox API functions</verify>
  <done>VM template validation properly wired to Proxmox API integration layer</done>
</task>

</tasks>

<verification>
- OpenClaw VM template includes working cloud-init automation
- VM template validation properly integrates with Proxmox API
</verification>

<success_criteria>

- OpenClaw VM template automates complete Node.js + Docker setup
- VM template validation connects to Proxmox API integration
  </success_criteria>

<output>
After completion, create `.planning/phases/07-vm-to-run-openclaw/07-03B-SUMMARY.md`
</output>
