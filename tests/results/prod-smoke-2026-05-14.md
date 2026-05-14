# Block X — production smoke (`npm run smoke:block-x`)

**When:** 2026-05-14  
**Host:** `https://api.ih35dispatch.com` (default `BLOCK_X_PROD_BASE_URL`)  
**Flags:** `BLOCK_X_SMOKE_SKIP=1` (scheduled-reports local E2E skipped per Block C scope).  

**Credentials:** `BLOCK_X_PROD_COOKIE` and `BLOCK_X_PROD_OPERATING_COMPANY_ID` were **not** available in this workspace, so authenticated prod checks reported **SKIPPED**. Jorge should export both locally and re-run **`npm run smoke:block-x`** (omit `BLOCK_X_SMOKE_SKIP` only if the local API E2E is intended).

---

Raw console output:

```
> ih35-v3-build@0.0.1 smoke:block-x
> tsx scripts/smoke-tests/block-x-scheduled-reports-e2e.ts && tsx scripts/smoke-tests/block-x-production-health.ts

[block-x scheduled-reports e2e] SKIP (BLOCK_X_SMOKE_SKIP=1)

[block-x production health] BASE_URL=https://api.ih35dispatch.com
┌─────────┬───────────────────────────────┬───────────┬─────────────────────────────────────────────────────────────────┐
│ (index) │ check                         │ result    │ detail                                                          │
├─────────┼───────────────────────────────┼───────────┼─────────────────────────────────────────────────────────────────┤
│ 0       │ 'scheduled-reports freshness' │ 'SKIPPED' │ 'Set BLOCK_X_PROD_COOKIE and BLOCK_X_PROD_OPERATING_COMPANY_ID' │
│ 1       │ 'GET /api/v1/qbo/sync/runs'   │ 'SKIPPED' │ 'missing cookie/company'                                        │
└─────────┴───────────────────────────────┴───────────┴─────────────────────────────────────────────────────────────────┘

[block-x production health] done
```
