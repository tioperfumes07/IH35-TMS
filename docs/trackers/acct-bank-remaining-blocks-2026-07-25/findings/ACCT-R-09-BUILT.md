# ACCT-R-09 — BUILT

**block_id:** `0441-mod7-bill-subnav-filters-not-creators_UI`  
**Verdict:** BUILT  
**Date:** 2026-07-25

## Evidence

- `apps/frontend/src/routes/manifest.tsx` — maintenance/repair/fuel/driver bill routes use `<Navigate to="/accounting/bills?category=…&create=1" />`
- `scripts/verify-bill-subnav-creators.mjs`
- `scripts/verify-steps/1484-verify-bill-subnav-creators.mjs`
