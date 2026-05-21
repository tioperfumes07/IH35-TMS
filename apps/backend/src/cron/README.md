# Cron Tenant Context Guard

Scheduler entry points that read or set `operating_company_id` must enforce the DD-7 fail-fast contract with:

- `assertTenantContext(...)` from `apps/backend/src/cron/_helpers/tenant-context-guard.ts`
- a direct call before tenant-scoped queries or `set_config('app.operating_company_id', ...)`

If a cron is truly tenant-agnostic, add this marker near the top of the file so the CI guard can skip it:

`// @cron-tenant-agnostic: <reason>`

This rule is enforced by `scripts/verify-scheduler-tenant-context.mjs` (DS-REMEDIATE-6 / B-017).
