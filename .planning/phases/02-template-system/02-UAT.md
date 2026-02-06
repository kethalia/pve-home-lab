---
status: complete
phase: 02-template-system
source: 02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md, 02-04-SUMMARY.md, 02-05-SUMMARY.md
started: 2026-02-06T21:00:00Z
updated: 2026-02-06T16:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Templates page loads with sidebar

expected: Visit http://localhost:3001/templates — page loads with the sidebar visible on the left (Templates and Packages nav links). Main content area shows either template cards or an empty state message.
result: pass

### 2. Sidebar navigation links

expected: Sidebar has "Templates" and "Packages" links. Clicking "Packages" navigates to /templates/packages. Clicking "Templates" navigates back to /templates.
result: pass

### 3. Discover Templates button

expected: On the /templates page, there's a "Discover Templates" button. Clicking it triggers a filesystem scan. While running, the button shows a loading/pending state. After completion, the page refreshes with discovered templates.
result: pass

### 4. Template cards in grid

expected: After discovery, template cards appear in a responsive grid (up to 3 columns on wide screens). Each card shows the template name, description, tags as badges, resource info (CPU/RAM/disk), and counts (scripts, packages, files).
result: pass

### 5. Search filters templates

expected: Typing in the search input filters templates by name. There's a short delay (debounce) before results update. Clearing the search shows all templates again. The URL updates with ?search=... parameter.
result: pass

### 6. Tag filtering

expected: Tag buttons appear below the search. Clicking a tag highlights it and filters to only templates with that tag. Clicking multiple tags uses AND logic (only templates with ALL selected tags show). Clicking an active tag deselects it.
result: pass

### 7. Empty and no-results states

expected: Before discovery, the page shows a "No templates discovered yet" message. After discovery, searching for a non-existent term shows a "no results" message.
result: pass

### 8. Loading skeleton

expected: When navigating to /templates (e.g. via sidebar link), a loading skeleton briefly appears with placeholder card shapes before the real content loads.
result: pass

### 9. Packages page loads

expected: Visit http://localhost:3001/templates/packages — page loads showing package bucket management. Shows either bucket cards or an empty state with a "Create Bucket" button.
result: pass

### 10. Create a package bucket

expected: Clicking "Create Bucket" opens a dialog with name and description fields. Filling them in and submitting creates the bucket. A toast notification confirms success. The new bucket card appears on the page.
result: pass

### 11. Add packages to a bucket

expected: On a bucket card, there's an input to add a package by name. Typing a name and submitting adds it as a badge inside the card. The package can be removed by clicking its remove/X button.
result: pass

### 12. Bulk import comment stripping

expected: Create a new bucket, click Bulk Import, paste a list with comment lines (# prefixed). Only non-comment lines should be added as packages. Comment lines should be stripped.
result: pass

### 13. Edit a bucket

expected: Each bucket card has an edit button. Clicking it opens a dialog pre-filled with the bucket's current name and description. Updating and saving shows a toast and refreshes the card.
result: pass

### 14. Delete bucket with cascade

expected: Click Delete on a bucket. A styled shadcn AlertDialog appears showing the bucket name and package count. Clicking Delete removes the bucket and all its packages. A toast confirms deletion.
result: pass

### 15. Template detail page loads with tabs

expected: Click on any template card from /templates. The /templates/[id] page loads showing a "Back to Templates" link, the template name as heading, description, source badge, and tags. Below, a tabbed interface with Config, Scripts, Packages, and Files tabs. Config tab active by default.
result: pass

### 16. Config tab shows resources and features

expected: On the Config tab, resource settings display in a grid: CPU cores, Memory (MB), Swap, Disk (GB), Storage target, Network bridge. Below, feature flags show as Enabled/Disabled badges: Unprivileged, Nesting, Keyctl, FUSE.
result: pass

### 17. Scripts tab with collapsible content

expected: Click the "Scripts" tab. Shows a list of scripts in execution order, each with an order badge, name, and enabled/disabled indicator. Clicking a script expands it to reveal the script content in a monospace code block. Clicking again collapses it.
result: pass

### 18. Packages tab grouped by manager

expected: Click the "Packages" tab. Packages are grouped by manager type (e.g., "APT Packages (N)"). Each package shows as a badge. If no packages exist, shows an empty state message.
result: pass

### 19. Files tab with policy badges

expected: Click the "Files" tab. Config files are listed with name, target path (monospace), and a color-coded policy badge (replace/default/backup). Clicking expands to show file content in a code block.
result: pass

### 20. Tab switching without page reload

expected: Switching between Config, Scripts, Packages, and Files tabs is instant — no page reload, no loading spinner. The URL does not change. Tab counts show in the tab labels (e.g., "Scripts (11)").
result: pass

### 21. Edit button links to edit page

expected: On the template detail page, there's an "Edit Template" button. Clicking it navigates to /templates/[id]/edit.
result: pass

### 22. Create template page loads

expected: Visit http://localhost:3001/templates/new (or click "Create Template" from /templates). A multi-section form loads with: Basics (name, description, tags, OS template), Resources (CPU, memory, swap, disk, storage, bridge), Features (switches for unprivileged, nesting, keyctl, FUSE), Scripts section, Packages section, and Files section.
result: pass

### 23. Script editor add and remove

expected: In the Scripts section of the form, click "Add Script". An entry appears with Order, Name, Description, Content (textarea), and an Enabled toggle. Adding multiple scripts and changing order numbers reorders them. The X button removes a script.
result: pass

### 24. File editor add and remove

expected: In the Files section, click "Add File". An entry appears with Name, Target Path, Policy dropdown (replace/default/backup), and Content textarea. Adding multiple files works. The X button removes a file.
result: pass

### 25. Package bucket selection

expected: In the Packages section, available buckets appear as checkboxes with name and package count. Checking a bucket shows its packages as a preview (read-only badges).
result: pass

### 26. Create template submission

expected: Fill in at least the Name field and submit the form. The template is created and you're redirected to its detail page at /templates/[id] showing the data you entered.
result: pass

### 27. Edit template pre-populated

expected: Navigate to an existing template's detail page and click "Edit Template". The edit form loads with all fields pre-populated from the existing template data — basics, resources, features, scripts, packages, and files.
result: pass

### 28. Edit template save

expected: Change a field (e.g., description or a resource value) and submit. You're redirected back to the detail page showing the updated value.
result: pass

## Summary

total: 28
passed: 28
issues: 0
pending: 0
skipped: 0

## Gaps

[none]
