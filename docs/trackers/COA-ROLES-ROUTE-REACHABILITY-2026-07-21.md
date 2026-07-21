# CoA-roles route reachability — narrative correction (2026-07-21)

**Verdict: `ALREADY_MOUNTED`.** The claim that the CoA-roles API "was never registered, so
`CoaRolesPage` is dead" is **FALSE** on `origin/main` (60b69dc9d). The endpoints register at boot
purely via `@fastify/autoload`. No double-mount is needed; this change adds **only** a regression
guard + this note. It changes no runtime code.

## What was claimed vs. what is true

- **Claimed:** `apps/backend/src/index.ts` never mounts CoA-roles, so `/api/v1/accounting/coa-roles`
  404s and `CoaRolesPage` is dead.
- **True:** `registerAccountingRoutes(app)` (called in `apps/backend/src/index.ts`) autoloads every
  `*.routes.{ts,js}` under `apps/backend/src/accounting/`. `accounting/coa-roles/coa-roles.routes.ts`
  is `export default fp(registerCoaRolesRoutes)`. Because it is wrapped in `fastify-plugin` (`fp`),
  autoload's directory-name prefix does **not** apply, so the routes land at their **absolute** paths
  even though the file lives in the `coa-roles/` subdirectory.

## LIVE PROOF (boot-time route dump, 2026-07-21)

A bare Fastify instance + `await registerAccountingRoutes(app)` + `onRoute` capture / `printRoutes`
(run against the byte-identical accounting autoload source) yields:

```
=== onRoute-captured coa-roles routes ===
GET  /api/v1/accounting/coa-roles
GET  /api/v1/accounting/coa-roles/validate
HEAD /api/v1/accounting/coa-roles
HEAD /api/v1/accounting/coa-roles/validate
PUT  /api/v1/accounting/coa-roles
=== printRoutes contains 'coa-roles' ? === true
├── /api/v1/accounting/coa-roles (GET, HEAD, PUT)
```

Cross-check of the mechanism: the base `/api/v1/accounting/cash-flow` path is **absent** from the
same dump — cash-flow/cash-forecast/finance-hub are **named-export-only** (no `export default fp`),
so autoload skips them and they are mounted **explicitly** in `index.ts` (0441-mod10). CoA-roles has
the `export default fp` that those lacked, which is exactly why autoload mounts it and did not mount
them.

## Why the guard (Rule 16)

The reachability is silent. If `coa-roles.routes.ts` loses its `export default fp(...)`, if
`accounting/index.ts` stops autoloading `.routes.` files, or if `coa-roles` is added to the autoload
`ignorePattern` **without** an explicit mount, all three endpoints 404 with no other failure and no
red test. `scripts/verify-coa-roles-route-reachable.mjs` (wired via
`scripts/verify-steps/1200-verify-coa-roles-route-reachable.mjs`) fails loudly if the registrar
becomes unreachable by **both** paths (autoload include **OR** explicit mount), and its `--selftest`
proves the guard catches each regression.

## Scope / non-goals

- **Non-financial.** No GL/posting/schema/RLS change. No CoA account migrations.
- Does **not** seed roles, touch `catalogs.account_role_bindings`, or author CoA account migrations.
- Rule 17: no edits to `package.json`, `.github/workflows/ci.yml`, or `locked-guards.yml`
  (verify-step is auto-discovered).
