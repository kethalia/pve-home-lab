---
phase: 07-vm-to-run-openclaw
plan: 03A
type: execute
wave: 3
depends_on: ["02"]
files_modified:
  [
    "apps/dashboard/src/components/templates/template-form.tsx",
    "apps/dashboard/src/components/templates/VMConfigSection.tsx",
    "apps/dashboard/src/lib/database/templates.ts",
    "apps/dashboard/src/lib/templates/actions.ts",
  ]
autonomous: true

must_haves:
  truths:
    - "Users can create VM templates with OpenClaw-optimized settings through the template creation workflow"
    - "Users can configure VM-specific options (UEFI, machine type, cloud-init) when creating templates"
    - "VM template creation validates OpenClaw requirements and stores templates in database"
  artifacts:
    - path: "apps/dashboard/src/components/templates/VMConfigSection.tsx"
      provides: "VM configuration form section"
      min_lines: 80
    - path: "apps/dashboard/src/lib/database/templates.ts"
      provides: "VM template database operations"
      exports: ["createTemplate", "updateTemplate"]
  key_links:
    - from: "apps/dashboard/src/components/templates/template-form.tsx"
      to: "VMConfigSection component"
      via: "conditional render based on templateType"
      pattern: "templateType.*vm.*VMConfigSection"
    - from: "apps/dashboard/src/lib/templates/actions.ts"
      to: "VM template validation"
      via: "Zod schema validation"
      pattern: "VMTemplateSchema"
---

<objective>
Extend the template creation UI to support VM templates with OpenClaw-optimized configuration options.

Purpose: Enable users to create VM templates through the existing template form interface with proper validation and database integration.
Output: Extended template form supporting VM configuration with OpenClaw-optimized defaults and proper validation.
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
@apps/dashboard/src/components/templates/template-form.tsx
@apps/dashboard/src/lib/database/templates.ts
@apps/dashboard/src/lib/templates/actions.ts
@apps/dashboard/CLAUDE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create VM configuration form section</name>
  <files>apps/dashboard/src/components/templates/VMConfigSection.tsx</files>
  <action>
    Create VM-specific configuration form section following shadcn/ui patterns:
    
    1. Use FormField, FormItem, FormLabel, FormControl, FormMessage from shadcn Form
    2. VM configuration fields:
       - BIOS Type: Select (SeaBIOS, OVMF/UEFI) 
       - CPU Type: Select (host, kvm64, x86-64-v2-AES) with descriptions
       - Machine Type: Select (pc, q35) - q35 for UEFI, pc for legacy
       - Memory: Input with min 1GB, recommended 4GB for OpenClaw
       - Storage: Select for cloud-init ISO storage location  
       - Network: Bridge configuration (vmbr0, vmbr1, etc.)
    3. Use shadcn Select, Input, Label components - never raw HTML
    4. Include helper text explaining OpenClaw requirements (2+ cores, 2GB+ RAM)
    5. Validate minimum requirements in form validation
    6. Default to OpenClaw-optimized settings: UEFI, q35, 4GB RAM, 2 cores
    
    Export as default component for use in template-form.tsx.
  </action>
  <verify>Component compiles, renders form fields using shadcn components</verify>
  <done>VM configuration form section available with OpenClaw-optimized defaults</done>
</task>

<task type="auto">
  <name>Task 2: Extend template form and database service for VM support</name>
  <files>apps/dashboard/src/components/templates/template-form.tsx, apps/dashboard/src/lib/database/templates.ts, apps/dashboard/src/lib/templates/actions.ts</files>
  <action>
    Extend existing template system for VM template support:
    
    template-form.tsx:
    1. Add templateType field using shadcn Select (LXC, VM) 
    2. Conditionally render VMConfigSection when templateType==="vm"
    3. Update form schema to include VM fields (biosType, cpuType, etc.)
    4. Maintain existing LXC sections for backward compatibility
    5. Use controlled form pattern with react-hook-form + zodResolver
    
    templates.ts (DatabaseService):
    1. Import TemplateType enum and VM field types from Plan 01's schema updates
    2. Update createTemplate/updateTemplate to handle VM fields (biosType, cpuType, machine, cloudInitStorage, efidisk)
    3. Set proper defaults for VM templates (templateType: TemplateType.vm, UEFI defaults)
    4. Modify createTemplate to check templateType and handle both LXC and VM creation
    5. Validate VM-specific constraints (memory ≥ 1GB, etc.)
    6. Handle both LXC and VM template creation in same methods
    
    actions.ts:
    1. Update createTemplateAction/updateTemplateAction schemas
    2. Add VM field validation using imported VMTemplateSchema
    3. Ensure server actions work with both template types
    
    Preserve all existing LXC functionality - this is additive, not replacement.
  </action>
  <verify>Template form shows VM section when VM type selected, database operations handle both types</verify>
  <done>Template creation system supports both LXC and VM templates with type-specific validation</done>
</task>

</tasks>

<verification>
- Template form shows VM configuration section when VM type selected
- Database operations handle both LXC and VM template creation
- Form validation enforces OpenClaw minimum requirements
</verification>

<success_criteria>

- Users can create VM templates using existing template creation workflow
- VM configuration form provides OpenClaw-optimized defaults
- Template creation maintains backward compatibility with existing LXC templates
  </success_criteria>

<output>
After completion, create `.planning/phases/07-vm-to-run-openclaw/07-03A-SUMMARY.md`
</output>
