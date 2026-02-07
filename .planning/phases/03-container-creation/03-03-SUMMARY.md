---
phase: 03-container-creation
plan: 03
subsystem: container-wizard-ui
tags: [wizard, react-hook-form, zod, shadcn, server-actions, bullmq]
depends_on:
  requires: ["03-01"]
  provides: ["container-creation-wizard-ui", "container-server-action"]
  affects: ["03-04", "04-01"]
tech-stack:
  added: []
  patterns:
    [
      "wizard-step-state-management",
      "zodResolver-base-schema-pattern",
      "password-generate-copy",
    ]
key-files:
  created:
    - apps/dashboard/src/lib/containers/schemas.ts
    - apps/dashboard/src/lib/containers/actions.ts
    - apps/dashboard/src/app/(dashboard)/containers/new/page.tsx
    - apps/dashboard/src/app/(dashboard)/containers/new/container-wizard.tsx
    - apps/dashboard/src/app/(dashboard)/containers/new/wizard-stepper.tsx
    - apps/dashboard/src/app/(dashboard)/containers/new/steps/template-step.tsx
    - apps/dashboard/src/app/(dashboard)/containers/new/steps/configure-step.tsx
    - apps/dashboard/src/app/(dashboard)/containers/new/steps/packages-step.tsx
    - apps/dashboard/src/app/(dashboard)/containers/new/steps/scripts-step.tsx
    - apps/dashboard/src/app/(dashboard)/containers/new/steps/review-step.tsx
  modified: []
decisions:
  - id: "base-schema-pattern"
    decision: "Split containerConfigSchema into base (for react-hook-form) and refined (for server validation) to avoid z.coerce/z.default type incompatibility with zodResolver"
    rationale: "zodResolver expects input types to match output types; z.coerce produces unknown input types; z.default produces optional input types — both break react-hook-form generics"
  - id: "manual-password-confirm"
    decision: "Password confirmation validated manually in onSubmit instead of Zod .refine()"
    rationale: ".refine() on schema creates type mismatch between input/output for zodResolver; manual check in submit handler is equally effective"
  - id: "packages-grouped-by-manager"
    decision: "Template packages grouped by package manager as toggle-able buckets in wizard Step 3"
    rationale: "Provides logical grouping without needing actual PackageBucket DB references in the wizard flow"
metrics:
  duration: "~9 minutes"
  completed: "2026-02-07"
---

# Phase 03 Plan 03: Container Creation Wizard UI Summary

**One-liner:** 5-step container creation wizard with template selection, Zod-validated configuration form, password auto-generate, package/script management, and server action that creates DB records and enqueues BullMQ jobs.

## Task Commits

| Task | Name                                                     | Commit    | Key Files                                                                       |
| ---- | -------------------------------------------------------- | --------- | ------------------------------------------------------------------------------- |
| 1    | Wizard Zod schemas, server action, and page shell        | `ff12bb9` | schemas.ts, actions.ts, page.tsx                                                |
| 2    | Wizard shell, stepper, template step, and configure step | `5aa7e96` | container-wizard.tsx, wizard-stepper.tsx, template-step.tsx, configure-step.tsx |
| 3    | Packages, scripts, and review step components            | `016fd5b` | packages-step.tsx, scripts-step.tsx, review-step.tsx                            |

## What Was Built

### Zod Validation Schemas (`schemas.ts`)

- `templateSelectionSchema` — Step 1 (template ID + name, nullable for "from scratch")
- `containerConfigBaseSchema` — Step 2 base schema for react-hook-form compatibility
- `containerConfigSchema` — Refined version with password confirmation check
- `packageSelectionSchema` — Step 3 (enabled bucket IDs + additional packages)
- `scriptConfigSchema` — Step 4 (scripts with enabled/order)
- `createContainerInputSchema` — Server action input combining all wizard data
- All types exported for client and server use

### Server Actions (`actions.ts`)

- `getWizardData()` — fetches templates (with packages/scripts), Proxmox storages, bridges, nextVmid
- `createContainerAction` — validates input, encrypts password, creates Container DB record, resolves OS template path, enqueues BullMQ job, returns container ID

### Wizard UI Components

- **Page** (`page.tsx`) — server component fetching wizard data, renders ContainerWizard
- **WizardStepper** — horizontal progress indicator with circles, checkmarks, connecting lines
- **ContainerWizard** — client shell with useState for each step's data, useTransition for deploy
- **TemplateStep** — card grid with "Start from Scratch" + template cards (tags, script/package counts)
- **ConfigureStep** — shadcn Form with sections: Identity, Access (password generate + copy), Resources, Storage & Network, Features, Tags
- **PackagesStep** — toggleable package groups by manager, expandable badges, additional packages textarea
- **ScriptsStep** — enable/disable switches with up/down reorder buttons
- **ReviewStep** — read-only summary with Deploy button, loading state, TODO for Save as Template

## Decisions Made

1. **Base schema pattern for react-hook-form:** Split containerConfigSchema into `containerConfigBaseSchema` (plain z.number(), no .default(), no .refine()) for zodResolver compatibility and `containerConfigSchema` (with .refine()) for server-side validation. This avoids the input/output type mismatch that z.coerce and z.default create with react-hook-form's generic resolution.

2. **Manual password confirmation:** Validated in onSubmit handler rather than Zod .refine() to avoid type mismatch with zodResolver.

3. **Packages grouped by manager:** Template packages displayed as logical groups by package manager (apt, npm, pip, etc.) rather than requiring actual PackageBucket references.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] zodResolver type incompatibility with z.coerce and z.default**

- **Found during:** Task 2
- **Issue:** `z.coerce.number()` produces `unknown` as input type and `.default()` produces optional input types, both incompatible with react-hook-form's generic constraints for zodResolver
- **Fix:** Removed z.coerce (use z.number() + valueAsNumber on inputs) and .default() (provide explicit defaults in useForm defaultValues), split schema into base and refined versions
- **Files modified:** schemas.ts, configure-step.tsx

## Next Phase Readiness

- Container creation wizard is fully functional
- Server action creates DB record and enqueues BullMQ job
- Depends on 03-02 worker to process enqueued jobs
- Progress page (`/containers/[id]/progress`) not yet created (expected in 03-04)
- Save as Template deferred with TODO comment

## Self-Check: PASSED
