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

## Cookie Writes Forbidden in RSC

Never call `session.destroy()` or modify cookies in Server Components or layouts. Cookie mutations only in Server Actions, Route Handlers, or middleware (Next.js 16+ requirement).

## Server Action Patterns

- Use `authActionClient` from `@/lib/safe-action` for all authenticated actions
- Define Zod schemas in `lib/*/schemas.ts` files (shared between server and client)
- Client forms use `useAction()` from `next-safe-action/hooks` for execution
- Redirect on success client-side via `router.push()` in `onSuccess` callback
