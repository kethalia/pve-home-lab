# Dashboard Development Conventions

## shadcn-first Rule

Always use shadcn/ui components. Never create custom HTML elements when a shadcn component exists or can be installed. Custom implementations are a last resort only.

### Forms

- All forms MUST use shadcn `Form` (react-hook-form based) with `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage`
- Never use raw `<form>` + `useActionState` — use `useForm()` + `useAction()` from next-safe-action instead
- Field validation via `zodResolver` with shared Zod schemas from `lib/*/schemas.ts`
- Server actions use `authActionClient.schema(schema).action()` pattern

### UI Components

- Badges: Use `<Badge>` from `@/components/ui/badge` — never custom `<span>` with badge-like styling
- Error displays: Use `<Alert variant="destructive">` for server/form-level errors, `<FormMessage>` for field-level errors — never custom `<p>` or `<div>` with error styling
- Inputs: Use `<Input>`, `<Textarea>`, `<Select>`, `<Switch>`, `<Checkbox>` from `@/components/ui/` — never raw HTML equivalents
- Labels: Use `<FormLabel>` inside `FormField`, or `<Label>` from `@/components/ui/label` outside form contexts

### Adding New Components

If a shadcn component is needed but not installed, add it:

```
npx shadcn@latest add <component-name>
```

## `server-only` Import Policy

Add `import "server-only"` to any module that must never run in client bundles. This causes a build-time error if accidentally imported from a `"use client"` file.

**MUST have `server-only`:**

- `lib/safe-action.ts` — next-safe-action client factory
- `lib/session.ts` — iron-session + Redis session management
- `lib/templates/discovery.ts` — filesystem access
- `lib/templates/parser.ts` — filesystem access
- Any new `lib/` module that uses Node.js-only APIs and is NOT imported by the worker

**MUST NOT have `server-only`** (imported by the BullMQ worker process which runs outside Next.js via `tsx`):

- `lib/db.ts`, `lib/encryption.ts`, `lib/redis.ts`, `lib/ssh.ts`
- `lib/queue/container-creation.ts`
- `lib/proxmox/*` (all files)
- These files have a comment `// No "server-only" — used by worker process` as documentation

**MUST NOT have `server-only`** (shared types/utils used by client components):

- `lib/*/schemas.ts` — Zod schemas shared with react-hook-form
- `lib/utils.ts`, `lib/utils/*` — utility functions used in client components

**`"use server"` action files** (`lib/*/actions.ts`) — `server-only` is optional since `"use server"` already enforces the server boundary. They transitively import `safe-action.ts` which has `server-only`.

## Cookie Writes Forbidden in RSC

Never call `session.destroy()` or modify cookies in Server Components or layouts. Cookie mutations only in Server Actions, Route Handlers, or middleware (Next.js 16+ requirement).

## Server Action Patterns

- Use `authActionClient` from `@/lib/safe-action` for all authenticated actions
- Define Zod schemas in `lib/*/schemas.ts` files (shared between server and client)
- Client forms use `useAction()` from `next-safe-action/hooks` for execution
- Redirect on success client-side via `router.push()` in `onSuccess` callback
