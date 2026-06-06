# Lucia Bypass Guard Pattern

## Purpose

Prevent tenant-isolation regressions on runtime code paths using `withLuciaBypass`.

## Rule

Every `withLuciaBypass(...)` call in normal request-auth code must satisfy one of:

- `assertCompanyMembership(...)` appears earlier in the same function scope, or
- the route/path is clearly ADMIN-ONLY, or
- the file belongs to BOOTSTRAP infrastructure (`auth`, `health`, `webhook`, `cron`).

If none of the above applies, the call site is a hard failure.

## CI Enforcement

`scripts/verify-lucia-bypass-guard-pattern.mjs` scans `apps/backend/src/**/*.ts` and fails with an offender list for any NORMAL-AUTH call site that lacks guard evidence.

`/.github/workflows/closure-checks.yml` runs this verification on PRs and main pushes.

## Why

`withLuciaBypass` is intentional infrastructure bypass. On tenant-scoped request paths, guard-before-bypass is mandatory to avoid cross-company reads/writes.
