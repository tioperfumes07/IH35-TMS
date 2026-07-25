# ACCT/BANK remaining packet — BUILT honesty purge (round 2)

**Date:** 2026-07-25  
**Base:** `origin/main` (fresh branch `hold/acct-r09-r26-honesty-round2`)  
**Lane:** DOCS / NON-FINANCIAL — tracker + verify-step wiring only; no code fixes re-invented.  
**PR:** `[HOLD]` — do not merge without owner review.

## Purpose

Five accounting remaining-packet items were still marked OPEN/GAP in pile trackers despite being **already built on `origin/main`**. This PR encodes verified BUILT verdicts so dispatch does not re-build shipped work.

## BUILT verdicts (verified before this PR)

| Finding ID | block_id (pile key) | Verdict | Evidence |
|---|---|---|---|
| ACCT-R-09 | `0441-mod7-bill-subnav-filters-not-creators_UI` | **BUILT** | `manifest.tsx` Navigate `?category=X&create=1` for maintenance/repair/fuel/driver bill subnav; `scripts/verify-bill-subnav-creators.mjs`; verify-step **1484** |
| ACCT-R-10 | `0441-mod7-myaccountant-flag-no-seed` | **BUILT** | Migration `202607590000_my_accountant_flag_seed.sql`; Neon lucia: `lib.feature_flags` has `MY_ACCOUNTANT_ENABLED` `default_enabled=false`; `scripts/verify-myaccountant-flag-seeded.mjs`; verify-step **1485** |
| ACCT-R-14 | `audit4-tax-return-automation` | **BUILT** | `accounting/sales-tax/sales-tax.routes.ts` default fp export autoloaded via `registerAccountingRoutes`; FE `SalesTaxPage` + subnav "Sales tax"; Neon `accounting.sales_tax_returns` table exists (0 rows); `scripts/verify-acct-r14-sales-tax-autoload.mjs`; verify-step **1486** |
| ACCT-R-22 | `fh-unit-allocation-ui-view-missing` | **BUILT** | `AllocationsPage` + `api/allocations.ts` + `allocations.routes.ts`; verify-step **1251** (`verify-allocations-page`) |
| ACCT-R-26 | `h-05-home-kpi-no-date-range-toggle` | **BUILT** | `HomeKpiRangeToggle` on `OwnerHome` / `DefaultHome`; verify-step **1215** (`verify-home-kpi-range-toggle`) |

## Rule 16 evidence block

```
ROOT CAUSE: Pile trackers and remaining-packet index still listed five accounting items as OPEN/GAP after code + guards shipped on origin/main.
FIX: Flip block-audit-piles entries to BUILT/DONE with dated evidence; add honesty doc; wire missing verify-steps (1484–1486) per Rule 17.
GUARD: verify-bill-subnav-creators (1484), verify-myaccountant-flag-seeded (1485), verify-acct-r14-sales-tax-autoload (1486); pre-existing 1251 + 1215 for R-22/R-26.
LIVE PROOF: Repo scan on origin/main @ branch HEAD — manifest create=1 routes, migration file, sales-tax.routes.ts fp export, AllocationsPage route, HomeKpiRangeToggle imports. Neon table existence cited from owner verify pass (sales_tax_returns 0 rows).
REMAINING: Corporate/income tax return automation (if ever scoped) is out of scope for ACCT-R-14 — sales-tax submodule only.
```

## Files touched

- `docs/trackers/block-audit-piles-2026-07-21.json` — five pile flips
- `docs/trackers/acct-bank-remaining-blocks-2026-07-25/` — index + FINDING stubs moved to BUILT
- `scripts/verify-steps/1484-verify-bill-subnav-creators.mjs`
- `scripts/verify-steps/1485-verify-myaccountant-flag-seeded.mjs`
- `scripts/verify-acct-r14-sales-tax-autoload.mjs`
- `scripts/verify-steps/1486-verify-acct-r14-sales-tax-autoload.mjs`
