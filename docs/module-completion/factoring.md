# Module completion — Factoring (FACT)

**PROGRESS: 9 of 10** · complete: `false` · as_of: 2026-08-02 · live_sha: `—`

| Status | Count |
|---|---:|
| PASS | 9 |
| HOLD | 0 |
| OPEN | 1 |
| FAIL | 0 |
| UNVERIFIED | 0 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `FACT-S01` | **PASS** | /factoring home KPI row matches factoring.factor canonical row | getFactoringSummary KPI row + need-company + ListErrorBanner; guard verify-fact-s01-home-surface.mjs. Additional regression coverage: FactoringHome.kpi-error.test.tsx (2 tests, all green) covers the successful KPI render and the ListErrorBanner honest-error state. | — |
| `FACT-DUAL-01` | **PASS** | Factor profile panel reads factoring.factor columns (not mdata.vendors notes parse) | listFactors/updateFactor + no vendor-notes; verify-factoring-home-canonical-factor-profile + verify-fact-s01-home-surface | — |
| `FACT-DUAL-02` | **PASS** | SubmitFactoringModal rates from factoring.factor (not parseVendorNotes) | SubmitFactoringModal reads the active factor from listFactors/factoring.factor and prefills advance_rate, reserve_rate, fee_rate from the canonical factoring.factor row; no parseVendorNotes usage; guard verify-fact-dual-02-submit-rates-from-factor.mjs selftests. | #5337 |
| `FACT-DUAL-03` | **PASS** | factoring.routes active factor resolves canonical factoring.factor not mdata.vendors | factoring.routes.ts resolveActiveFactor delegates to resolveCanonicalActiveFactor from home/factoring-balance-invoice-linkage.service.ts, which resolves the canonical active factor via factoring.canonical_factor_agreements JOIN factoring.factor JOIN mdata.vendors; no direct mdata.vendors scan in route for active factor; guard verify-fact-dual-03-routes-resolve-canonical-factor.mjs selftests. | #5338 |
| `FACT-S02` | **PASS** | /factoring/submit submission queue wired and entity-scoped | SubmissionQueue need-company + ListErrorBanner + honest empty; verify-fact-s02-submit-surface.mjs | — |
| `FACT-S03` | **PASS** | /factoring/batches batch wizard + detail drill-through | BatchWizard need-company + ListErrorBanner + honest empty; BatchDetail company-gated; verify-fact-s03-batches-surface.mjs | — |
| `FACT-S04` | **PASS** | /factoring/reserves reserve dashboard economics honest | ReserveDashboard need-company + ListErrorBanner + honest empty; verify-fact-s04-reserves-surface.mjs; Rule 19 no CoA reserve mutations | — |
| `FACT-S05` | **PASS** | Duplicate factor vendor banner excludes self-pairs | DuplicateVendorsBanner now excludes self-pairs: backend scan-duplicate-vendors.routes.ts excludes identical normalized vendor names (lower(a.vendor_name) <> lower(b.vendor_name)); frontend DuplicateVendorsBanner filters pairs where IDs or normalized names match; guard verify-fact-fix1-duplicate-vendors-banner updated with selftest. | #5336 |
| `FACT-UNIT-01` | **PASS** | Banking factor virtual register amount displays cents/100 correctly | Banking factor virtual register in apps/backend/src/banking/banking.routes.ts exposes factoring advance amount as (fa.advance_amount_cents::numeric / 100) AS amount, consumed as dollars by the register; guard verify-fact-unit-01-banking-factor-register-scale.mjs selftests. | #5339 |
| `FACT-VERIFY-01` | **OPEN** | Factoring module VERIFY-1..8 click-through TRANSP + USMCA | scaffold — not proven | — |

Desktop audit: ~/Desktop/IH35-CURSOR-AUDIT/AUDITOR-RUN-2026-07-31/modules/factoring-deep-2026-08-01.md
