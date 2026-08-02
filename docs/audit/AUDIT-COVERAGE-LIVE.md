# AUDIT-COVERAGE-LIVE — append-only findings table

Single source of truth for the 30-module × 5-layer (A/B/C/D/E) audit. This file is **append-only**.
Never delete a row. To supersede a finding, add a NEW dated row and mark the OLD row's Verdict as
`SUPERSEDED (see YYYY-MM-DD row)`.

## COLUMN OWNERSHIP (never edit another role's column)
- **CASCADE owns:** `Module`, `Layer`, `Entity`, `Verdict`, `Evidence`, `Date`, `Auditor` — appends new rows only.
- **CODER/CURSOR own:** `Status`, `Block/PR` — only on rows in their own lane, only to write `FIXED (PR #...)`.
- **GUARD owns:** `Status` → `VERIFIED` / `REOPENED` — only GUARD writes these two values.
- A row with no `Evidence` is not a finding — it does not count toward the scoreboard.

## HARD RULE
No module is certified PASS until Layers A, B, C, D, and E each independently PASS, with live
evidence, **per entity**. A `PASS` verdict is TRANSP-only unless the `Entity` column explicitly says
`both` or there is a separate `USMCA` row for the same Module×Layer.

## SCOREBOARD (updated each session — snapshot 2026-08-02, session start)
- **Certified full-PASS modules (all 5 layers, both entities): 0 / 30**
- **Modules with at least one confirmed live FAIL: 16 / 30** (Home/Tasks, Fuel, Dispatch, Maintenance,
  Safety, Fleet, Settlements, Accounting, Banking, Factoring, Customers, Vendors, Inventory, Reports,
  ParityTable — Vendors newly added 2026-08-02 via `CLS-SUBLEDGER-GL-DARK`)
- **Layer C UNVERIFIED: 12 / 30** (Home/Tasks, Driver Hub, Safety, Compliance, Driver Profile, Fleet,
  Legal, Cash Flow, Inventory, Docs, Users, ELD/Telematics) — audit order this session is Layer C
  FIRST on exactly these 12.
- **Layer E UNVERIFIED: 27 / 30** (only Banking, Customers, ParityTable have any Layer E verdict) —
  Layer E runs LAST per owner order but stays in scope.
- **NEW upstream signal (2026-08-02, this session):** `git pull --ff-only origin main` on the `main`
  worktree pulled in a large batch of CODER-side commits including
  `scripts/verify-steps/1969-verify-bill-vendor-link-canonical-uuid.mjs`,
  `1973-verify-banking-cash-kpi-cents-unit.mjs`, `1977/1979-verify-dispatch-oos-gate/status-view.mjs`,
  `1981-verify-fuel-recon-totals-contract.mjs`, `1983-verify-insurance-claim-linkage.mjs` — these verify-step
  names directly match FAILs recorded below (Accounting Bills→Vendor link, Banking cash-KPI 100x,
  Dispatch pre-dispatch validator, Reports fuel-reconciliation contract mismatch, Insurance claim
  linkage). **Not yet re-verified live by CASCADE as of this row** — flagged for immediate re-check
  before those FAIL rows are treated as still-open. CODER/GUARD should update `Status`/`Block/PR` on
  the relevant rows once merged; CASCADE will append a fresh dated verdict row after live re-verification.

---

## Findings table

| Module | Layer | Entity | Verdict | Evidence | Date | Auditor | Status | Block/PR |
|---|---|---|---|---|---|---|---|---|
| Home/Tasks | A | TRANSP | PASS | Live surface loads, dashboard renders | 2026-08-01 | Cascade | | |
| Home/Tasks | B | TRANSP | FAIL | 2 confirmed: dual-path WO count mismatch; HOS>24h anomaly not flagged | 2026-08-01 | Cascade | | |
| Home/Tasks | C | TRANSP | UNVERIFIED | Not yet traced to a financial primitive / GL | 2026-08-02 | Cascade | | |
| Home/Tasks | D | TRANSP | N/A | No pickers on this surface | 2026-08-01 | Cascade | | |
| Home/Tasks | E | TRANSP | UNVERIFIED | Not yet run | 2026-08-01 | Cascade | | |
| Fuel | A | TRANSP | PASS | Live surface loads | 2026-08-01 | Cascade | | |
| Fuel | B | TRANSP | FAIL | 3 dead-stub views: savings/compliance/planner-routes | 2026-08-01 | Cascade | | |
| Fuel | C | TRANSP | FAIL | `LAYERC-fuel-GL-CRITICAL-2026-08-02.md` — $625,546.39 across 1,547 real fuel txns, zero GL representation despite `EXPENSE_GL_POSTING_ENABLED` ON; class `CLS-FUEL-GL-DARK` | 2026-08-02 | Cascade | | |
| Fuel | D | TRANSP | N/A | No comboboxes exist in Fuel transaction/import surfaces (confirmed architectural, not a picker-law fail) | 2026-08-02 | Cascade | | |
| Fuel | E | TRANSP | UNVERIFIED | Not yet run | 2026-08-01 | Cascade | | |
| Dispatch | A | TRANSP | PASS | Live surface loads | 2026-08-01 | Cascade | | |
| Dispatch | B | TRANSP | UNVERIFIED | Badge resolved; rest not re-checked | 2026-08-01 | Cascade | | |
| Dispatch | C | TRANSP | FAIL | `units_with_dispatch_status` dead view disables 3 pre-dispatch safety gates. CODER fix pulled 2026-08-02: `scripts/verify-steps/1977-verify-dispatch-oos-gate-not-view-dependent.mjs`, `1979-verify-dispatch-status-view-not-stub.mjs` — NOT YET LIVE-RE-VERIFIED by Cascade; Status/Block/PR are CODER/GUARD-owned, left blank here by design | 2026-08-01 | Cascade | | |
| Dispatch | C | TRANSP | SUPERSEDED (see below) — was wrongly marked PASS (load→invoice→AR→GL) off 1 hand-picked example | superseded by `CRITICAL-CORRECTION-invoice-bill-payment-GL-DARK-2026-08-02.md` | 2026-08-01 | Cascade | | |
| Dispatch | C | TRANSP | FAIL | SUPERSEDED (see 2026-08-02 row below) — retraction of above: 1 of 11,977 invoices ($40.7M) ever posted to GL company-wide; new class `CLS-SUBLEDGER-GL-DARK`. See `CRITICAL-CORRECTION-invoice-bill-payment-GL-DARK-2026-08-02.md` | 2026-08-02 | Cascade | | |
| Dispatch | C | TRANSP | POSTING BEING ENABLED (owner decision 2026-08-02) — UNVERIFIABLE-UNTIL-FLAG-LIVE, not FAIL, not PASS | Reclassification: the un-journalized invoice population documented above was posting-flag-OFF-by-design, not a defect. Per owner decision 2026-08-02, all TMS posting flags are being turned ON (QBO write-back stays OFF separately). Pre-flip population counts stand as the honest baseline to re-check against post-flip. Real task: re-verify Layer C after flag flip via `verify-chain-06-invoice-ar-chain-proof` plus a fresh live population count, not a repeat of the pre-flip snapshot | 2026-08-02 | Cascade | | |
| Dispatch | D | TRANSP | PASS | Load-cancellation-reason picker: `catalogs.load_cancellation_reasons`, 21 real rows, double-confirmed | 2026-08-01 | Cascade | | |
| Dispatch | E | TRANSP | UNVERIFIED | Not yet run | 2026-08-01 | Cascade | | |
| Maintenance | A | TRANSP | PASS | Live surface loads | 2026-08-01 | Cascade | | |
| Maintenance | B | TRANSP | PASS+FAIL | Open-WO KPI correct; dashboard-kpis dead stub; aged-report missing `voided_at` | 2026-08-01 | Cascade | | |
| Maintenance | C | TRANSP | PASS (honest-empty) | `BILL_GL_POSTING_ENABLED` confirmed ON both entities; 0 of 2 TRANSP WOs closed so 0 bills/JEs exist yet — data scarcity not plumbing defect. `LAYERC-load-invoice-GL-2026-08-02.md` | 2026-08-02 | Cascade | | |
| Maintenance | D | TRANSP | UNVERIFIED | Not yet run | 2026-08-01 | Cascade | | |
| Maintenance | E | TRANSP | UNVERIFIED | Not yet run | 2026-08-01 | Cascade | | |
| Safety | A | TRANSP | PASS | Live surface loads | 2026-08-01 | Cascade | | |
| Safety | B | TRANSP | FAIL | 3 dead-stub views: `safety_dashboard_kpis`, `safety_events_with_driver`, `liabilities_active_with_context` | 2026-08-01 | Cascade | | |
| Safety | C | TRANSP | PASS (honest-empty) | Two parallel chains traced structurally: (1) `safety.internal_fines.driver_liability_id`→`driver_finance.driver_liabilities` — column exists but has NO enforced FK constraint (structural gap, minor); (2) `safety.civil_fines`→`accounting.civil_fine_postings.expense_je_id`→`accounting.journal_entries` — clean FK-enforced chain. BOTH chains are 0 rows across ALL companies in the entire DB (`safety.internal_fines`=0, `safety.civil_fines`=0, `driver_finance.driver_liabilities`=0, `accounting.civil_fine_postings`=0) — genuine data scarcity, not a defect | 2026-08-02 | Cascade | | |
| Safety | D | TRANSP | UNVERIFIED | Not yet run | 2026-08-01 | Cascade | | |
| Safety | E | TRANSP | UNVERIFIED | Not yet run | 2026-08-01 | Cascade | | |
| Compliance | A | TRANSP | PASS | Live surface loads | 2026-08-01 | Cascade | | |
| Compliance | B | TRANSP | PASS | Verified, methodology-corrected | 2026-08-01 | Cascade | | |
| Compliance | C | TRANSP | PASS (honest-empty) | Chain traced: `safety.company_violations`→`safety.company_violation_fines`→`safety.civil_fines`→`accounting.civil_fine_postings.expense_je_id`→`accounting.journal_entries` (same GL leg confirmed sound under Safety Layer C). `safety.hos_violations` is a separate non-GL compliance-only table (no financial primitive expected). ALL of `company_violations`, `company_violation_fines`, `hos_violations` = 0 rows company-wide (all companies, not just TRANSP) — genuine data scarcity, not a defect | 2026-08-02 | Cascade | | |
| Compliance | D | TRANSP | UNVERIFIED | Not yet run | 2026-08-01 | Cascade | | |
| Compliance | E | TRANSP | UNVERIFIED | Not yet run | 2026-08-01 | Cascade | | |
| Driver Profile | A | TRANSP | PASS | Live surface loads | 2026-08-01 | Cascade | | |
| Driver Profile | B | TRANSP | PASS/OPEN | Roster consistent; possible duplicate name OPEN | 2026-08-01 | Cascade | | |
| Driver Profile | C | TRANSP | PASS (honest-empty) | Same chain as Settlements Layer C, viewed from driver end: 98 real TRANSP drivers exist (`mdata.drivers`), but `driver_finance.driver_settlements`/`driver_advances`/`driver_reimbursements`/`deduction_schedule` are all 0 rows company-wide. Posters already code-verified sound in `LAYERC-settlements-GL-2026-08-02.md` — same finding, not re-derived | 2026-08-02 | Cascade | | |
| Driver Profile | D | TRANSP | UNVERIFIED | Not yet run | 2026-08-01 | Cascade | | |
| Driver Profile | E | TRANSP | UNVERIFIED | Not yet run | 2026-08-01 | Cascade | | |
| Fleet | A | TRANSP | PASS | Live surface loads | 2026-08-01 | Cascade | | |
| Fleet | B | TRANSP | PASS+FAIL | Roster PASS; 72/72 trailers blank VIN/Make/Year | 2026-08-01 | Cascade | | |
| Fleet | C | TRANSP | UNVERIFIED | Not yet traced (unit/asset→depreciation/maintenance→GL) | 2026-08-02 | Cascade | | |
| Fleet | D | TRANSP | UNVERIFIED | Not yet run | 2026-08-01 | Cascade | | |
| Fleet | E | TRANSP | UNVERIFIED | Not yet run | 2026-08-01 | Cascade | | |
| Insurance | A | TRANSP | PASS | Claims crash FIXED (#3998), now unblocked | 2026-08-01 | Cascade | | |
| Insurance | B | TRANSP | OPEN | 0 policies — confirmed genuine data gap, not code bug | 2026-08-01 | Cascade | | |
| Insurance | C | TRANSP | PARTIAL (structural PASS, blocked-on-data) | `INSURANCE-claim-depth-bar-2026-08-02.md` — 6/9 hops live/code-complete; 2 confirmed structural gaps (claim→deductions no FK; claim→liability wired only to internal_fines); live data walk blocked on 0 policies. CODER fix pulled 2026-08-02: commit `#4003 "wire a claim to the money side"`, `1983-verify-insurance-claim-linkage.mjs` — appears to directly target the 2 structural gaps above; NOT YET LIVE-RE-VERIFIED by Cascade; Status/Block/PR are CODER/GUARD-owned, left blank here by design | 2026-08-02 | Cascade | | |
| Insurance | C | TRANSP | PARTIAL — schema-level corroboration of #4003 fix | Live schema re-check (during Safety Layer C sweep) confirms `insurance.claim` now HAS a real FK constraint `claim_liability_id_fkey` → `driver_finance.driver_liabilities(id)` (ON DELETE SET NULL) — this did not exist at the original 2026-08-02 structural walk. Confirms #4003 landed at the schema level. Still NOT live-re-walked with an actual claim row (0 policies/claims blocks that) — structural confirmation only, not a live-data PASS | 2026-08-02 | Cascade | | |
| Insurance | D | TRANSP | PASS | Unit/Asset combobox verified real+working | 2026-08-02 | Cascade | | |
| Insurance | E | TRANSP | UNVERIFIED | Not yet run | 2026-08-01 | Cascade | | |
| Legal | A | TRANSP | PASS | Live surface loads | 2026-08-01 | Cascade | | |
| Legal | B | TRANSP | UNVERIFIED | Not yet run | 2026-08-01 | Cascade | | |
| Legal | C | TRANSP | UNVERIFIED | Not yet traced (claims/liabilities→GL) | 2026-08-02 | Cascade | | |
| Legal | D | TRANSP | UNVERIFIED | Not yet run | 2026-08-01 | Cascade | | |
| Legal | E | TRANSP | UNVERIFIED | Not yet run | 2026-08-01 | Cascade | | |
| Cash Flow | A | TRANSP | PASS | Live surface loads | 2026-08-01 | Cascade | | |
| Cash Flow | B | TRANSP | PASS | Corroborates Banking P0 cash-KPI finding | 2026-08-01 | Cascade | | |
| Cash Flow | C | TRANSP | UNVERIFIED | Not yet cross-checked against Banking Layer C GL result | 2026-08-02 | Cascade | | |
| Cash Flow | D | TRANSP | N/A | No pickers on this surface | 2026-08-01 | Cascade | | |
| Cash Flow | E | TRANSP | UNVERIFIED | Not yet run | 2026-08-01 | Cascade | | |
| Settlements | A | TRANSP | PASS | Live surface loads | 2026-08-01 | Cascade | | |
| Settlements | B | TRANSP | OPEN | Money tables still $0, not re-litigated this session | 2026-08-01 | Cascade | | |
| Settlements | C | TRANSP | PASS (honest-empty) | `LAYERC-settlements-GL-2026-08-02.md` — every driver-finance money table genuinely 0 rows across ALL companies in DB, not just TRANSP/USMCA; posters code-verified sound | 2026-08-02 | Cascade | | |
| Settlements | D | TRANSP | FAIL+PASS | Deduction-type picker hardcoded enum despite `catalogs.driver_deduction_types` existing/registered/used by sibling picker — straight swap fix; payment-method PASS (`catalogs.payment_methods`, 27 real rows) | 2026-08-01 | Cascade | | |
| Settlements | E | TRANSP | UNVERIFIED | Not yet run | 2026-08-01 | Cascade | | |
| Accounting | A | TRANSP | PASS | Live surface loads | 2026-08-01 | Cascade | | |
| Accounting | B | TRANSP | PASS (caveat) | Trial Balance exact-to-penny GL match — only proves internal consistency of a 172-row GL, not that it reflects the true ~34,000-row AR/AP subledger. See `CRITICAL-CORRECTION-invoice-bill-payment-GL-DARK-2026-08-02.md` | 2026-08-02 | Cascade | | |
| Accounting | C | TRANSP | FAIL | Bills→Vendor link wrong column, 404s (separate finding, still stands, independent of the posting-flag reclassification below). CODER fix pulled 2026-08-02: `scripts/verify-steps/1969-verify-bill-vendor-link-canonical-uuid.mjs`, commit `#4003`/`#4002`-adjacent batch — NOT YET LIVE-RE-VERIFIED by Cascade; Status/Block/PR columns are CODER/GUARD-owned, left blank here by design | 2026-08-01 | Cascade | | |
| Accounting | C | TRANSP | SUPERSEDED — was wrongly marked PASS (invoice→AR→GL posting engine live-verified, both entities) off 1 hand-picked example | superseded by `CRITICAL-CORRECTION-invoice-bill-payment-GL-DARK-2026-08-02.md` | 2026-08-01 | Cascade | | |
| Accounting | C | TRANSP | FAIL — HIGHEST-DOLLAR FINDING OF AUDIT | SUPERSEDED (see 2026-08-02 reclassification row below) — `CRITICAL-CORRECTION-invoice-bill-payment-GL-DARK-2026-08-02.md`: 0 of 3,195 bills ($26.7M), 0 of 12,123 customer payments ($39.9M), 0 of 6,543 bill payments, 1 of 11,977 invoices ($40.7M) ever posted to GL despite flag ON. Root cause: invoice/bill create+send routes never call the posting engine; only manual per-row POST or never-scheduled backfill does. Class `CLS-SUBLEDGER-GL-DARK` | 2026-08-02 | Cascade | | |
| Accounting | C | TRANSP | POSTING BEING ENABLED (owner decision 2026-08-02) — UNVERIFIABLE-UNTIL-FLAG-LIVE, not FAIL, not PASS | Reclassification: un-journalized invoice/bill/payment population was posting-flag-OFF-by-design, not a defect. Per owner decision 2026-08-02, all TMS posting flags going ON (QBO write-back stays OFF). Pre-flip population counts ($40.7M invoices / $26.7M bills / $39.9M payments, 0 posted) stand as honest baseline. Real task: re-verify via `verify-chain-06-invoice-ar-chain-proof` + fresh population count post-flip, both entities | 2026-08-02 | Cascade | | |
| Accounting | C | USMCA | PASS (single test row) | 1 real bill ($1.00) posted successfully — proves poster itself works; corroborates root cause is "nothing calls it," not a broken poster | 2026-08-02 | Cascade | | |
| Accounting | D | TRANSP | PASS | JE-type (`catalogs.journal_entry_types`, 16 rows) / category (`catalogs.qbo_categories`, real writable) / Accounts-CoA (`catalogs.accounts`, 399 rows, create-gate confirmed OFF/live) | 2026-08-02 | Cascade | | |
| Accounting | E | TRANSP | UNVERIFIED | Not yet run | 2026-08-01 | Cascade | | |
| Banking | A | TRANSP | PARTIAL | `LAYERA-E-banking-received-view-2026-08-02.md` — 1,255 real credits exist, paginate fully (no silent cap), but no single view ever shows all 1,255 at once (single-account-scoped, no aggregate; split 527/201/326/73/20/108 across 6 accounts × 3 review tabs) | 2026-08-02 | Cascade | | |
| Banking | B | TRANSP | FAIL | P0 cash-KPI 100x scale bug + P1 1 dead-stub tile view. CODER fix pulled 2026-08-02: `scripts/verify-steps/1973-verify-banking-cash-kpi-cents-unit.mjs` — NOT YET LIVE-RE-VERIFIED by Cascade; Status/Block/PR are CODER/GUARD-owned, left blank here by design | 2026-08-01 | Cascade | | |
| Banking | B | USMCA | PASS | 100x-scale bug does NOT reproduce; fix holds cross-entity (USMCA Cash Posting $93.68 ≈ Home $94) | 2026-08-01 | Cascade | | |
| Banking | C | TRANSP | PASS | `LAYERC-banking-GL-2026-08-02.md` — bank-categorization→JE 167/167, transfers→JE 3/3, zero gap, full population | 2026-08-02 | Cascade | | |
| Banking | C | USMCA | PASS | Same chain 3/3 bank-categorization→JE, 1/1 transfers→JE, zero gap | 2026-08-02 | Cascade | | |
| Banking | D | TRANSP | UNVERIFIED | Not yet run | 2026-08-01 | Cascade | | |
| Banking | E | TRANSP | PASS | All/Spent/Received filter chrome real, correctly wired, QBO-style; same single-account scope caveat as Layer A | 2026-08-02 | Cascade | | |
| Factoring | A | TRANSP | PASS | Live surface loads | 2026-08-01 | Cascade | | |
| Factoring | B | TRANSP | UNVERIFIED | Not yet run | 2026-08-01 | Cascade | | |
| Factoring | C | TRANSP | FAIL | KPI-vs-profile dual-path; dead vendor-notes read | 2026-08-01 | Cascade | | |
| Factoring | D | TRANSP | PASS (partial) | Cash-advance purpose picker | 2026-08-01 | Cascade | | |
| Factoring | E | TRANSP | UNVERIFIED | Not yet run | 2026-08-01 | Cascade | | |
| Finance Hub | A | TRANSP | PASS | Honest gates | 2026-08-01 | Cascade | | |
| Finance Hub | B | TRANSP | N/A | No independent data surface | 2026-08-01 | Cascade | | |
| Finance Hub | C | TRANSP | N/A | No independent GL primitive | 2026-08-01 | Cascade | | |
| Finance Hub | D | TRANSP | N/A | No pickers | 2026-08-01 | Cascade | | |
| Finance Hub | E | TRANSP | UNVERIFIED | Not yet run | 2026-08-01 | Cascade | | |
| Customers | A | TRANSP | PASS | Live surface loads | 2026-08-01 | Cascade | | |
| Customers | B | TRANSP | PASS | Roster consistent | 2026-08-01 | Cascade | | |
| Customers | C | TRANSP | FAIL | SUPERSEDED (see 2026-08-02 reclassification row below) — same `CLS-SUBLEDGER-GL-DARK` chain traced via top customer "Unlimited Logistics" (538 invoices, 0 posted). `CRITICAL-CORRECTION-invoice-bill-payment-GL-DARK-2026-08-02.md` | 2026-08-02 | Cascade | | |
| Customers | C | TRANSP | POSTING BEING ENABLED (owner decision 2026-08-02) — UNVERIFIABLE-UNTIL-FLAG-LIVE, not FAIL, not PASS | Same reclassification as Dispatch/Accounting — posting-flag-OFF-by-design, not a defect. Re-verify customer→invoice→AR→GL chain post-flip | 2026-08-02 | Cascade | | |
| Customers | D | TRANSP | PASS | Payment-terms clauses 1/2/3/4/6/7 confirmed via shared-component architecture + Neon schema; clause 5 test-write inconclusive | 2026-08-01 | Cascade | | |
| Customers | E | TRANSP | FAIL | Edit/New-transaction button chrome inconsistency | 2026-08-01 | Cascade | | |
| Vendors | A | TRANSP | PASS | Live surface loads | 2026-08-01 | Cascade | | |
| Vendors | B | TRANSP | PASS | Roster consistent | 2026-08-01 | Cascade | | |
| Vendors | C | TRANSP | FAIL | SUPERSEDED (see 2026-08-02 reclassification row below) — same `CLS-SUBLEDGER-GL-DARK` chain, AP side: 0 of 3,195 TRANSP bills ($26.7M) ever posted to GL. `CRITICAL-CORRECTION-invoice-bill-payment-GL-DARK-2026-08-02.md` | 2026-08-02 | Cascade | | |
| Vendors | C | TRANSP | POSTING BEING ENABLED (owner decision 2026-08-02) — UNVERIFIABLE-UNTIL-FLAG-LIVE, not FAIL, not PASS | Same reclassification, AP side — posting-flag-OFF-by-design, not a defect. Re-verify vendor→bill→AP→GL chain post-flip | 2026-08-02 | Cascade | | |
| Vendors | D | TRANSP | PASS | Vendor quick-create: `mdata.vendors`, 950 real rows, `createVendor()`→`POST /api/v1/mdata/vendors` confirmed | 2026-08-01 | Cascade | | |
| Vendors | E | TRANSP | UNVERIFIED | Not yet run | 2026-08-01 | Cascade | | |
| Inventory | A | TRANSP | PASS | Live surface loads | 2026-08-01 | Cascade | | |
| Inventory | B | TRANSP | PASS+FAIL | Roster PASS; Category column 100% blank, 144/144 | 2026-08-01 | Cascade | | |
| Inventory | C | TRANSP | UNVERIFIED | Not yet traced (parts usage→COGS/WO→GL) | 2026-08-02 | Cascade | | |
| Inventory | D | TRANSP | UNVERIFIED | Not yet run | 2026-08-01 | Cascade | | |
| Inventory | E | TRANSP | UNVERIFIED | Not yet run | 2026-08-01 | Cascade | | |
| 425C | A | TRANSP | PASS | Live surface loads | 2026-08-01 | Cascade | | |
| 425C | B | TRANSP | PASS | Profiles&Defaults matches Neon exactly incl. 18-question set; Exhibit A live JSON verified; QB Import + Merge&Export real | 2026-08-01 | Cascade | | |
| 425C | C | TRANSP | N/A | No GL primitive | 2026-08-01 | Cascade | | |
| 425C | D | TRANSP | N/A | No pickers | 2026-08-01 | Cascade | | |
| 425C | E | TRANSP | UNVERIFIED | Not yet run | 2026-08-01 | Cascade | | |
| Lists | A | TRANSP | PASS | Live surface loads | 2026-08-01 | Cascade | | |
| Lists | B | TRANSP | UNVERIFIED | Counts not cross-checked vs Neon | 2026-08-01 | Cascade | | |
| Lists | C | TRANSP | N/A | No independent GL primitive | 2026-08-01 | Cascade | | |
| Lists | D | TRANSP | UNVERIFIED | Not yet run | 2026-08-01 | Cascade | | |
| Lists | E | TRANSP | UNVERIFIED | Not yet run | 2026-08-01 | Cascade | | |
| Reports | A | TRANSP | PASS | Live surface loads | 2026-08-01 | Cascade | | |
| Reports | B | TRANSP | MIXED | 3 PASS exact-to-penny (Trial Balance, Balance Sheet, Company Overview); 2 CONFIRMED FAIL root-caused (A/P Aging 404 missing route; Fuel Reconciliation field-name mismatch, KPI tiles show $0 despite real data); 3 UNVERIFIED suspicious zero-row; 3 honest-empty; 3 unexecuted. CODER fix pulled 2026-08-02: commit `#4002 "mount the A/P aging route"`, `1981-verify-fuel-recon-totals-contract.mjs` — NOT YET LIVE-RE-VERIFIED by Cascade; Status/Block/PR are CODER/GUARD-owned, left blank here by design | 2026-08-01 | Cascade | | |
| Reports | C | TRANSP | N/A | Reports are read-only compilations, no independent GL primitive | 2026-08-01 | Cascade | | |
| Reports | D | TRANSP | N/A | No pickers | 2026-08-01 | Cascade | | |
| Reports | E | TRANSP | UNVERIFIED | Not yet run | 2026-08-01 | Cascade | | |
| Docs | A | TRANSP | PASS | Live surface loads | 2026-08-01 | Cascade | | |
| Docs | B | TRANSP | OPEN | 100% uncategorized/unlinked, real-gap vs software-gap undetermined | 2026-08-01 | Cascade | | |
| Docs | C | TRANSP | UNVERIFIED | Not yet traced (attachments likely N/A for GL, needs confirmation) | 2026-08-02 | Cascade | | |
| Docs | D | TRANSP | N/A | No pickers | 2026-08-01 | Cascade | | |
| Docs | E | TRANSP | UNVERIFIED | Not yet run | 2026-08-01 | Cascade | | |
| Users | A | TRANSP | PASS | Live surface loads | 2026-08-01 | Cascade | | |
| Users | B | TRANSP | PASS | Roster consistent | 2026-08-01 | Cascade | | |
| Users | C | TRANSP | UNVERIFIED | No expected GL primitive; needs explicit N/A confirmation | 2026-08-02 | Cascade | | |
| Users | D | TRANSP | N/A | No pickers | 2026-08-01 | Cascade | | |
| Users | E | TRANSP | UNVERIFIED | Not yet run | 2026-08-01 | Cascade | | |
| Help | A | TRANSP | PASS | Live surface loads | 2026-08-01 | Cascade | | |
| Help | B | TRANSP | N/A | Static content | 2026-08-01 | Cascade | | |
| Help | C | TRANSP | N/A | No GL primitive | 2026-08-01 | Cascade | | |
| Help | D | TRANSP | N/A | No pickers | 2026-08-01 | Cascade | | |
| Help | E | TRANSP | UNVERIFIED | Not yet run | 2026-08-01 | Cascade | | |
| Program | A | TRANSP | PASS | Live surface loads | 2026-08-01 | Cascade | | |
| Program | B | TRANSP | UNVERIFIED | Not yet run | 2026-08-01 | Cascade | | |
| Program | C | TRANSP | N/A | No GL primitive | 2026-08-01 | Cascade | | |
| Program | D | TRANSP | N/A | No pickers | 2026-08-01 | Cascade | | |
| Program | E | TRANSP | UNVERIFIED | Not yet run | 2026-08-01 | Cascade | | |
| System | A | TRANSP | PASS | Honest self-report incl. live `background_jobs.stale` alert | 2026-08-01 | Cascade | | |
| System | B | TRANSP | N/A | No independent data surface | 2026-08-01 | Cascade | | |
| System | C | TRANSP | N/A | No GL primitive | 2026-08-01 | Cascade | | |
| System | D | TRANSP | N/A | No pickers | 2026-08-01 | Cascade | | |
| System | E | TRANSP | UNVERIFIED | Not yet run | 2026-08-01 | Cascade | | |
| ParityTable (shared chrome) | A | TRANSP | UNVERIFIED | Resize hit-target undiscoverable | 2026-08-01 | Cascade | | |
| ParityTable (shared chrome) | B | TRANSP | N/A | Not a data surface | 2026-08-01 | Cascade | | |
| ParityTable (shared chrome) | C | TRANSP | N/A | No GL primitive | 2026-08-01 | Cascade | | |
| ParityTable (shared chrome) | D | TRANSP | N/A | No pickers | 2026-08-01 | Cascade | | |
| ParityTable (shared chrome) | E | TRANSP | FAIL | 4-6px resize handle, no visible affordance | 2026-08-01 | Cascade | | |
| ELD/Telematics | A | TRANSP | PASS | Real module, honest self-disclosing data-source citations | 2026-08-01 | Cascade | | |
| ELD/Telematics | B | TRANSP | UNVERIFIED | Not yet Neon-cross-checked | 2026-08-01 | Cascade | | |
| ELD/Telematics | C | TRANSP | UNVERIFIED | Not yet traced (HOS/mileage→IFTA/fuel-tax→GL) | 2026-08-02 | Cascade | | |
| ELD/Telematics | D | TRANSP | N/A | No pickers found this pass | 2026-08-01 | Cascade | | |
| ELD/Telematics | E | TRANSP | UNVERIFIED | Not yet run | 2026-08-01 | Cascade | | |

---

## Cross-cutting findings (not tied to a single module row above)

| Item | Entity | Verdict | Evidence | Date | Auditor | Status | Block/PR |
|---|---|---|---|---|---|---|---|
| `CLS-ECON-EMPTY` dead-stub-view sweep | TRANSP | FAIL | 16 confirmed live offenders, `CRITICAL-dead-stub-view-class-sweep-2026-08-01.md`; `units_with_dispatch_status` disables 3 real dispatch safety gates — most severe class-level finding pre-2026-08-02 | 2026-08-01 | Cascade | | |
| `CLS-DUAL-PATH` missing-`voided_at` sweep | TRANSP | FAIL | 3 confirmed offenders, `CLASS-SWEEP-voided-at-2026-08-01.md` | 2026-08-01 | Cascade | | |
| cents-as-dollars sweep | TRANSP | FAIL (contained) | Confirmed to exactly 1 call site, `banking.routes.ts:184`; sibling caller (`cash-flow.service.ts`) correct | 2026-08-01 | Cascade | | |
| Registry canonical-binding pass | both | PASS | `REGISTRY-canonical-binding-2026-08-02.md` — all 34 tables backing ~30 catalog-picker keys resolve to real, canonical, writable tables via `to_regclass()`; zero mirror-table bindings | 2026-08-02 | Cascade | | |
| USMCA entity-isolation direct-RLS probe | both | INCONCLUSIVE (tooling limitation) | `neondb_owner` has `rolbypassrls=true`, so psql-level `set_config('app.operating_company_id',...)` cannot validate RLS from this role — must retest via live app session | 2026-08-01 | Cascade | | |
| USMCA re-run entity isolation | both | PASS (no P0 leak found) | Home, Banking, Bills, Factoring, Settlements, Vendors, Customers, Accounts, Load-cancellation-reasons all isolated correctly on live app session, `USMCA-rerun-2026-08-01.md` | 2026-08-01 | Cascade | | |
| Platform / hygiene: stale `apps/backend/dist/**` committed to repo | n/a | OPEN (non-financial) | `dist/banking/factoring-virtual.routes.js` and `dist/factoring/factoring.routes.js` still reference `accounting.factoring_companies` (a retired table), tripping `verify-no-phantom-factoring-companies.mjs` in the pre-push static-guard suite. Build artifacts should not be committed/tracked — rebuild or gitignore `dist/` | 2026-08-02 | Cascade | | |
