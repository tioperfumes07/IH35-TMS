# ACCOUNTING DRAIN — WAVE 7 verify (2026-07-21)

**Base:** `origin/main` @ `ade4d3f56`  
**Worktrees:** `/private/tmp/ih35-acct-drain-w7-verify-*` · `/private/tmp/ih35-acct-drain-w7-ecmap-*` · `/private/tmp/ih35-acct-drain-w7-docs-*`  
**Scope:** next ~12 accounting GAP candidates (owner Wave-7 paste + remaining undrained leftovers) verified vs current `origin/main`; open REAL FIX only if a safe non-financial UI/guard residual remains.

Hard bans respected: `#3123/#3124/#3141/#3149` and already-open set `#3116–#3161`.  
Owner rulings locked for this drain: `accounting.chart_of_accounts_roles` PRIMARY; no invent GL; no CoA seed; Rule 17 for new guards; no `package.json` / CI workflow edits; builder never merges / never Neon-applies.

Sources cross-checked: `docs/trackers/block-audit-piles-2026-07-21.json`, `LIVE-AUDIT-GAPS-2026-07-21.md`, prior Waves 1–6 reports (open PRs `#3132/#3138/#3152/#3154/#3158/#3161` where not yet on main), merged design HOLD `#3127`.

| # | block_id | verdict | evidence (repo @ ade4d3f56) | follow-up PR |
|---|---|---|---|---|
| 1 | `accounting-2-ap-aging-qbo-mirror-population` | **NEEDS-PROD** (confirm W2) | `ap-aging.service.ts` exposes `qbo_mirror` status; `mdata.qbo_bills` written by outbound push (gated OFF under parallel-books) and read by `qbo-recon-reads.ts`. Inbound QBO→mirror (#1682 CLOSED unmerged). Live population = Neon RLS-bypass verdict only. | none — owner/GUARD Neon read |
| 2 | `0441-mod10-cashflow-accounting-routes-dead` | **STALE** | `index.ts` awaits `registerCashFlowRoutes` + `registerCashForecastRoutes` (+ module/manual). Guard `verify-cash-forecast-routes-registered.mjs` PASS (already CI-wired via locked-guards). | none |
| 3 | `0441-mod7-bill-subnav-filters-not-creators_UI` | **STALE** | `manifest.tsx` `/accounting/bills/{maintenance,repair,fuel,driver}` → `Navigate …?category=…&create=1`. Guard `verify-bill-subnav-creators.mjs` PASS (CI-wired). | none |
| 4 | `0441-mod7-myaccountant-flag-no-seed` | **STALE** | Migration `202607590000_my_accountant_flag_seed.sql` seeds `MY_ACCOUNTANT_ENABLED` default OFF. Guard `verify-myaccountant-flag-seeded.mjs` PASS (CI-wired). | none |
| 5 | `a-03-expenses-fullpage-form-not-list-drawer` | **STALE** | `ExpensesListPage` `+ Create` → `RecordExpenseModal`. Guard `verify-expenses-list-route.mjs` PASS. | none |
| 6 | `a-05-bills-no-page-level-create-button` | **STALE** | `BillsPage` `data-testid="bills-create-cta"` → `CreateBillModal`. Covered by bill-subnav guard CTA assert. | none |
| 7 | `0091-m-lists-2` | **HOLD / COVERED** | "Merge accounts" still deactivate-only (`CoaBatchActions.tsx`). True merge = financial cluster. Design HOLD **merged** `#3127` (`DESIGN-coa-true-merge-accounts-HOLD.md`). Interim honesty copy (§4) needs owner greenlight — not shipped this wave. | https://github.com/tioperfumes07/IH35-TMS/pull/3127 (merged design) |
| 8 | `driverprofile-1-companion-tier1-rls-hardening` | **SKIP (misfile)** | Accounting-pile misfile. Claim is drivers RLS companion to FE-only `#1742`. Refile → drivers; Neon RLS proof separate. (W3 confirmed.) | refile → drivers |
| 9 | `banking-b4-driver-vendor-account-mapping` | **COVERED** | Open HOLD `#3123` (held migration, recommendation-only). Stay OFF per hard ban. | https://github.com/tioperfumes07/IH35-TMS/pull/3123 |
| 10 | `banking-grid-sort-resize-rows-per-page` | **STALE** | `BankingTransactionsDesignView.tsx` ParityTable columns use `sortable: true` (pile claim of `sortable={false}` on every header is obsolete). Accounting-pile misfile → banking surface. | none — tracker decrement / refile banking |
| 11 | `0251-gap22-lumper-expense_VERIFY` | **STALE** (W2; suffix variant) | Carrier-paid lumper `INSERT accounting.expenses` + lines with `load_id` under `LUMPER_LIFECYCLE_ENABLED` (default OFF). | none |
| 12 | `0251-gap8-accessorials-gl_VERIFY` | **STALE** (W2; suffix variant) | Accessorial revenue via `invoice-line-revenue-resolution.service` + `expense_category_account_map` (kind=revenue). No `catalogs.charge_codes` table required. | none |
| 13 | `expense-category-map-account-picker-uuid` (found while draining) | **REAL FIX** | Add-modal datalist rendered raw account uuid (same class as CoA Roles `#3148`). Fixed to `<select value=uuid label=account_name>`; guard tightened. | fix PR (this wave) |

## Verdict counts

| Verdict | Count |
|---|---|
| STALE | 8 |
| NEEDS-PROD | 1 |
| HOLD / COVERED (merged design) | 1 (`0091-m-lists-2`) |
| COVERED (open HOLD) | 1 (`banking-b4` → `#3123`) |
| SKIP (misfile) | 1 (`driverprofile`) |
| REAL FIX (UI-only) | **1** (Expense Category Map picker) |
| new DESIGN HOLD | **0** |

## Accounting drain note

Wave 7 re-confirms the owner paste batch (mostly STALE from Waves 1–2) and closes the last undrained GAP leftovers (`0091-m-lists-2`, `banking-b4`, `banking-grid`, driverprofile misfile).  

One safe UI REAL FIX shipped: Expense Category Map account picker (sibling of open `#3148` CoA Roles picker).  

**Not shipped:** CoA "Merge accounts" interim honesty copy (`DESIGN-coa-true-merge-accounts-HOLD.md` §4) — waiting owner greenlight.  

Accounting pile pending remains ≈ **63** until tracker hygiene flips STALE/BUILT rows after coder merges wave docs.

## Discipline

- Builder **does not merge**. No Neon-apply.
- No schema / CoA seed / PUBLIC grants / package.json / CI workflow edits.
- UNVERIFIED this wave: live Neon row counts for `mdata.qbo_bills` (NEEDS-PROD #1); live Render deploy SHA lag vs `ade4d3f56`.
