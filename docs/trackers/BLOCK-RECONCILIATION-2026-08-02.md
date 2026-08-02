# BLOCK RECONCILIATION — 2026-08-02 (every block, built vs pending — verified)

**DONE** = verified on main (branch merged or all signature files present).  **NEEDS-VERIFY** = weak signal (title-match / partial files / self-report), not trusted until GUARD confirms.  **PENDING** = needs build.  **PENDING (GATED)** = financial/locked, needs Jorge's gate first.

**Verified against `origin/main` (12468 files) + 3000 merged PRs.** A block is **DONE only if its branch merged OR all its signature files are present on main** — those are the only evidence. Weak signals (PR-title token match, partial files, a doc's own "shipped/done" self-report, a prior hardcoded built-claim) are **NEEDS-VERIFY** — not trusted until GUARD confirms. Nothing reads as DONE that wasn't really verified.

## Counts
- **PENDING**: 14
- **PENDING (GATED)**: 27
- **NEEDS-VERIFY**: 57
- **DONE**: 685
- **AUDIT-NOTE**: 420

## Universe — why 1203 blocks (the "456 vs 294 .block-ready" gap, explained)
The reconciler spans **5 sources**, de-duped by **unique block_id** and **excluding retired duplicates** — the block count is the union, **not** the raw `.block-ready` file count.
- Total = union of 5 sources (.block-ready, docs/blocks program, docs/accounting, docs/dispatch enterprise-29, docs/specs gap), de-duped by UNIQUE block_id, EXCLUDING files with EXPLICIT retirement markers (_DUP/_STALE/_SUPERSEDED underscore suffixes, status superseded/duplicate/dup/stale, or superseded_by/duplicate_of). Hyphen descriptive …-stale/…-duplicate live defect IDs are NOT retired by filename alone. So the block count is neither the raw .block-ready file count nor inflated by duplicate/retired registrations.
- **`.block-ready/*.json` files on disk:** 1378 (of which **367 retired** dup/stale/superseded are excluded → **1011 active**)
- **By source (after de-dup):** .block-ready: 1006 · program: 86 · enterprise-29: 29 · accounting: 25 · gap-spec: 57

## Delta — blocks added since 2026-06-16 (today's work, now counted)
Blocks whose `.block-ready` file carries `"added" >= 2026-06-16`. If empty, no new blocks were registered.
| Block | Status | PR | Title |
|-------|--------|----|-------|
| BANK-18-DESIGNVIEW-QBO-PARITY | DONE | #3131 |  |
| BANK-18-KEYSTONE-CATEGORIZE-REGISTER | DONE | #3131 |  |
| DOC-15-QBO-TOKEN-AUTOREFRESH | NEEDS-VERIFY |  |  |
| DOC-16-RECON-INPROCESS-SCHEDULER | NEEDS-VERIFY | #2367 |  |
| DOC-17-DEFINITION-OF-DONE | DONE | #2370 |  |
| DOC-CATALOGS-ACCOUNTS-FK-INVENTORY | DONE | #1518 | Authoritative FK re-key inventory for catalogs.accounts (29 cols/20 tables) — AF-1 input. |
| DOC-CATALOGS-CLASSES-FK-INVENTORY | DONE | #1519 | catalogs.classes per-entity FK inventory — companion to AF-1. |
| FIX-19B-EXPENSES-CATEGORY-INLINE-CREATE | DONE |  |  |
| FIX-DISPATCH-DRIVER-PICKER-50-CAP | DONE | #1530 | Book Load driver picker 50-cap — load full active set (limit:200) so drivers past newest 50 appear (Mecor). Also #1529 i |
| FIX-DRIVERS-FULL-NAME-PHANTOM | DONE | #1534 | mdata.drivers.full_name phantom across 5 endpoints (42703) → CONCAT_WS(first,last); +db-test guard. |
| FIX-LEGAL-FLEET-VEHICLE-TYPE-PHANTOM | DONE | #1520 | Legal lease-to-own /fleet 500 — phantom u.unit_type → vehicle_type. |
| FIX-MAINTENANCE-SERVICES-ETA-PHANTOM | DONE | #1532 | services/eta 500 — 3 phantom mdata.units cols → telematics.vehicle_latest_position + maintenance.pm_schedules. |
| FIX-PER-TRUCK-CPM-PERMITS-CTE | DONE | #1517 | per-truck-cpm permits CTE 500 fix — repoint phantom CTE to the real unit relation; +static CI guard. |
| FIX-PICKERS-50-CAP-UNITS-VENDORS-CUSTOMERS | DONE | #1533 | 50-cap class — unit/vendor/customer client pickers load full active set (limit forwarded in mdata.ts). |
| IMPORT-0 | DONE | #1796 | IMPORT-0 QBO Reports API client (TrialBalance + GeneralLedger, v2 response shape) + exact-cents parsers + monthly date c |
| IMPORT-P0 | DONE | #1797 | IMPORT-P0 JE→QBO push kill-switch + masterdata echo guard. HARD PREREQUISITE: no import run (opening balance or GL detai |
| IMPORT-P0b | DONE | #1802 | IMPORT-P0b — entity-push kill-switch: gate every TMS→QBO write of invoice/bill/customer/vendor/account/item so nothing r |
| ITEM-02-EXCEL-UPLOAD-RLS-REASSERT | PENDING (GATED) | #2369 |  |
| ITEM-13-CEREMONY-VALIDATE-FKS | DONE | #2368 |  |
| ITEM-14-TXN-COMPANY-ISOLATION-GUARD | DONE | #2363 |  |
| QBO-SYNC-DRIFT-401-FIX | DONE | #1535 | QBO Sync Drift dashboard 401 — data calls send session cookie via apiRequest (was raw fetch). |
| RECON-00 | DONE | #2216 | RECON-00 Design lock: commit the TMS↔QBO Reconciliation Module architecture spec (double-books/no-sync, twice-daily pass |
| RECON-01 | NEEDS-VERIFY | #1831 | RECON-01 Schema + scheduled jobs + exception engine: additive CREATE TABLE accounting.recon_runs + accounting.recon_exce |
| RECON-02 | DONE | #1838 | RECON-02 UI tabs: extend the FIN-23 surface at /accounting/qbo-reconcile with Runs + Exceptions tabs (ParityTable gramma |
| SWEEP-FIX-17-27 | DONE | #1798 | Consolidated fixes for the modules 17-27 sweep defects. PR A ships the code fixes with regression tests; PR B (owner-gat |
| TBL-STANDARD-INSURANCE-POLICIES | DONE | #1531 | TBL-STANDARD surface 1 — migrate Insurance Policies list to the shared DataTable. |
| UNIFIED-TXN-REGISTER | DONE | #1536 | Unified Transaction Register — bank+fuel+AR+AP+settlement in one read-only entity-scoped register. |
| USERS-1-PR-B | DONE | #2281 | USERS-1 PR B: deactivate_probe_accounts admin-job operation + verify-no-fixture-users-prod-guard CI guard |

## Every block
| Block | Status | Fin | Tier | PR | Source | Evidence |
|-------|--------|-----|------|----|--------|----------|
| accounting-2-ap-aging-qbo-mirror-population | PENDING | 💰 |  | #2718 | .block-ready | [verified 2026-07-12] agent: mirror table unpopulated; inbound-sync PR #1682 CLOSED unmerged |
| AF-8-payroll-bridge | PENDING | 💰 | T1 |  | program | [verified 2026-07-03] TMS->QBO payroll write-bridge unbuilt (deferred) |
| C2-CANONICAL-forbid-live-writes-to-RETIRE-schemas-repoint-th | PENDING |  |  |  | program | forward spec — 0 named artifacts on main |
| C3-DATE-replace-native-date-inputs-with-the-shared-DatePicke | PENDING |  |  |  | program | forward spec — 0 named artifacts on main |
| C4-SETTINGS-server-persist-business-settings-not-localStorag | PENDING |  |  |  | program | forward spec — 0 named artifacts on main |
| C5-LINK-canonical-load-navigation-everywhere | PENDING |  |  |  | program | forward spec — 0 named artifacts on main |
| C6-MONEY-every-money-table-INSERT-posts-a-balanced-JE-via-th | PENDING |  |  |  | program | forward spec — 0 named artifacts on main |
| C7-CHROME-create-surfaces-use-the-shared-drawer-not-a-center | PENDING |  |  |  | program | forward spec — 0 named artifacts on main |
| C8-CLICK-THROUGH-no-dead-KPI-cards-on-primary-surfaces | PENDING |  |  |  | program | forward spec — 0 named artifacts on main |
| C9-DoD-B-no-rendered-field-dropped-on-save-form-round-trip-c | PENDING |  |  |  | program | forward spec — 0 named artifacts on main |
| chain-08-demo-data-purge | PENDING | 💰 |  | #2221 | .block-ready | [verified 2026-07-12] agent: audit lists only, purge Pass2 never ran (CHAIN-08-TRANSP-DEMO-DATA-AUDIT) |
| CHAIN-08-transp-demo-data-purge | PENDING | 💰 | T1 | #2221 | program | [verified 2026-07-12] agent: same PR #2221 explicitly no-purge per file header |
| driverprofile-1-companion-tier1-rls-hardening | PENDING | 💰 |  | #1742 | .block-ready | [verified 2026-07-12] agent: PR #1742 frontend test/UI only, zero RLS/backend touched |
| fk-safety-events-driver-status-0289 | PENDING | 💰 |  | #3950 | .block-ready | [verified 2026-07-12] agent: migration validates unrelated FKs, no safety_events/driver_status FK exists |
| AF-1-entity-coa-fix | PENDING (GATED) | 💰 | T1 |  | program | [verified 2026-07-03] held Tier-1 DO-NOT-RUN migration; prod still global — not applied |
| AF-2-qbo-drift | PENDING (GATED) | 💰 | T1 |  | program | [verified 2026-07-03] drift-resolution write feature not built |
| AF-4-ap-bills-migration | PENDING (GATED) | 💰 | T1 |  | program | [verified 2026-07-03] ~$1.18M A/P migration not executed (Tier-1 held) |
| AF-7-money-controls | PENDING (GATED) | 💰 | T1 |  | program | [verified 2026-07-03] partial built-gated; money flags OFF |
| BLOCK-01-of-29-TIER1.5-DEPRECIATION | PENDING (GATED) |  | T1.5 |  | enterprise-29 | deep-verified 2026-06-24 (feature grep) |
| BLOCK-02-of-29-TIER1.5-DRIVER-ESCROW | PENDING (GATED) |  | T1.5 |  | enterprise-29 | deep-verified 2026-06-24 (feature grep) |
| BLOCK-03-of-29-TIER1.5-IFTA | PENDING (GATED) |  | T1.5 |  | enterprise-29 | deep-verified 2026-06-24 (feature grep) |
| BLOCK-17-of-29-TIER2.5-W2-1099 | PENDING (GATED) |  | T2.5 |  | enterprise-29 | deep-verified 2026-06-24 (feature grep) |
| BLOCK-19-of-29-TIER3-AUDIT-HASH | PENDING (GATED) |  | T3 |  | enterprise-29 | deep-verified 2026-06-24 (feature grep) |
| BLOCK-24-of-29-TIER3.5-1099-ANNUAL | PENDING (GATED) |  | T3.5 |  | enterprise-29 | deep-verified 2026-06-24 (feature grep) |
| BLOCK-25-of-29-TIER3.5-CONSOLIDATION | PENDING (GATED) |  | T3.5 |  | enterprise-29 | deep-verified 2026-06-24 (feature grep) |
| CHAIN-06-invoice-ar-chain-proof | PENDING (GATED) | 💰 | T1 |  | program | [verified 2026-07-03] HOLD design doc only, no feature code |
| CHAIN-07-settlements-500-fix | PENDING (GATED) | 💰 | T1 |  | program | [verified 2026-07-03] HOLD design doc only, no 500 fix shipped |
| CONN-4-edi-foundation | PENDING (GATED) | 💰 | T2 |  | program | forward spec — 0 named artifacts on main |
| DISP-WIZARD-edit-load-patch | PENDING (GATED) |  | T2 |  | program | BUILD / GATED (HELD). Tier 2 (load edit) → Tier 1 if it touches billing/settlement. |
| DISP-WO-work-order-modal | PENDING (GATED) |  | T2 |  | program | LIVE-TRACED / BUILD. Tier 2 (build modal) — posting (create_bill_for_wo) Tier 1, STOPS for |
| ENT-AUDIT | PENDING (GATED) |  | T1 |  | program | VERIFY-STATE / BUILD. Tier per scope (any GL posting = Tier 1, STOPS for Jorge). |
| FH-VERIFY-finance-hub-modules | PENDING (GATED) | 💰 | T1 |  | program | forward spec — 0 named artifacts on main |
| FIX-05-BANKING-SPLIT-ENABLE-AND-WIRE | PENDING (GATED) | 💰 |  |  | .block-ready | [verified 2026-07-11] owner-verified: split modal built but button disabled Wave-2 + flag OFF; wire+dedupe pending, flag |
| HOS-FANOUT-03-08 | PENDING (GATED) |  | T2 |  | program | GATED / VERIFY-STATE. Tier 2. |
| HOS-MAP-driver-samsara-id | PENDING (GATED) |  | T2 |  | program | LIVE-TRACED / BUILD. Tier 2 (telematics) + MIGRATE if a backfill writes ids. STOPS for Jor |
| HOS-PRC-DATA-verbatim-clocks | PENDING (GATED) |  | T2 |  | program | LIVE-TRACED / GATED. Tier 2 (telematics, no money). |
| HOS-PRC2-reader-swap | PENDING (GATED) |  | T2 |  | program | GATED on GUARD per-driver verify (board == roster == Samsara certified ELD). Tier 2. |
| ITEM-02-EXCEL-UPLOAD-RLS-REASSERT | PENDING (GATED) | 💰 |  | #2369 | .block-ready | [verified 2026-07-11] HELD PR #2369; owner approves + runs as neondb_owner |
| STMT-3-1099-425c-consolidation | PENDING (GATED) | 💰 | T2 |  | program | forward spec — 0 named artifacts on main |
| USMCA-LAUNCH-carrier | PENDING (GATED) |  | T1 |  | program | GATED (launch July 2026). Tier 1 (new entity going live). STOPS for Jorge. |
| VOID-VERIFY-void-everywhere | PENDING (GATED) | 💰 | T1 |  | program | forward spec — 0 named artifacts on main |
| 0033-audit-schema-manifest-tool | NEEDS-VERIFY | 💰 |  | #3548 | .block-ready | PR #3548 title-match only, unverified |
| 0091-h2-1 | NEEDS-VERIFY | 💰 |  | #2638 | .block-ready | PR #2638 title-match only, unverified |
| 0091-h3-3 | NEEDS-VERIFY | 💰 |  | #2651 | .block-ready | PR #2651 title-match only, unverified |
| 0091-m-lists-2 | NEEDS-VERIFY | 💰 |  | #3127 | .block-ready | PR #3127 title-match only, unverified |
| 0243-g7-4-empty-e2e-specs-false-green | NEEDS-VERIFY | 💰 |  |  | .block-ready | 1/2 signature file(s) on main — partial, unverified |
| 0243-h1-2-cors-wrong-prod-defaults | NEEDS-VERIFY | 💰 |  |  | .block-ready | 3/4 signature file(s) on main — partial, unverified |
| 0441-mod10-payment-status-panel-404 | NEEDS-VERIFY | 💰 |  | #3097 | .block-ready | PR #3097 title-match only, unverified |
| 0441-mod8-backdated-check-dead | NEEDS-VERIFY | 💰 |  | #2671 | .block-ready | PR #2671 title-match only, unverified |
| 0441-mod8-tx-fields-captured-not-sent | NEEDS-VERIFY | 💰 |  | #3124 | .block-ready | PR #3124 title-match only, unverified |
| audit2-internal-controls-approval-workflow | NEEDS-VERIFY | 💰 |  | #3153 | .block-ready | PR #3153 title-match only, unverified |
| audit9-expense-validation-duplicate-detection | NEEDS-VERIFY | 💰 |  | #3143 | .block-ready | PR #3143 title-match only, unverified |
| BLOCK-02-DRIVER-ESCROW-DESIGN | NEEDS-VERIFY | 💰 |  | #2905 | .block-ready | [verified 2026-07-20] NOT A VERDICT — anti-fake-green downgrade. Registering this block pointed allowed_files at canonic |
| block-22-driver-settlement-engine | NEEDS-VERIFY | 💰 |  | #2905 | .block-ready | [verified 2026-07-20] NOT A VERDICT — anti-fake-green downgrade. Same cause: all signature files present on main auto-pr |
| BLOCKS-FUEL | NEEDS-VERIFY |  |  |  | program | partial 4/5 artifact(s) on main — unverified |
| C10-ROUTES-every-defined-route-is-mounted-no-404-route-manif | NEEDS-VERIFY |  |  | #3570 | program | PR #3570 title-match only, unverified |
| C11-SPLIT-BRAIN-single-canonical-table-per-entity-STOP-class | NEEDS-VERIFY |  |  | #3698 | program | PR #3698 title-match only, unverified |
| C7-ACCT-SUBNAV-CHROME | NEEDS-VERIFY | 💰 |  |  | .block-ready | 9/10 signature file(s) on main — partial, unverified |
| CHAIN-04-bill-payment-tieout | NEEDS-VERIFY | 💰 | T1 |  | program | [verified 2026-07-12] code-guard passes + reuses the CHAIN-05-proven posting engine, but 0 open bills on TRANSP to exerc |
| CONN-1-plaid-reconcile-commit | NEEDS-VERIFY | 💰 | T1 |  | program | [verified 2026-07-12] code-guard passes + reuses the CHAIN-05-proven posting engine, but 0 reconciliation sessions on TR |
| CONN-3-relay-internal-bank | NEEDS-VERIFY | 💰 | T1 | #3142 | program | PR #3142 title-match only, unverified |
| consolidate-distributed-modules-fuel-tasks-fin | NEEDS-VERIFY | 💰 |  | #3276 | .block-ready | [verified 2026-07-12] agent: PR #2135 docs-only, no code/migration touched |
| d-02-cancel-load-shown-on-unsaved-load | NEEDS-VERIFY | 💰 |  | #2778 | .block-ready | PR #2778 title-match only, unverified |
| db249-finance-schema-naming-drift | NEEDS-VERIFY | 💰 |  | #3852 | .block-ready | PR #3852 title-match only, unverified |
| db249-index-optimization-3 | NEEDS-VERIFY | 💰 |  | #3852 | .block-ready | PR #3852 title-match only, unverified |
| DOC-15-QBO-TOKEN-AUTOREFRESH | NEEDS-VERIFY | 💰 |  |  | .block-ready | [verified 2026-07-11] merged #2366; awaiting post-deploy hourly-tick refresh proof |
| DOC-16-RECON-INPROCESS-SCHEDULER | NEEDS-VERIFY | 💰 |  | #2367 | .block-ready | [verified 2026-07-11] PR #2367; awaiting first accounting.recon_runs row |
| f-01-fuel-home-stub | NEEDS-VERIFY | 💰 |  | #3812 | .block-ready | PR #3812 title-match only, unverified |
| f-02-jump-to-tab-nonstandard | NEEDS-VERIFY | 💰 |  | #3830 | .block-ready | PR #3830 title-match only, unverified |
| flow2-auto-deduction-trigger-from-customer-exp | NEEDS-VERIFY | 💰 |  | #3159 | .block-ready | PR #3159 title-match only, unverified |
| flow2-customer-chargeback-driver-expense | NEEDS-VERIFY | 💰 |  | #3159 | .block-ready | PR #3159 title-match only, unverified |
| flow6-auto-invoice-sending | NEEDS-VERIFY | 💰 |  | #3140 | .block-ready | PR #3140 title-match only, unverified |
| flow6-auto-payment-application | NEEDS-VERIFY | 💰 |  | #3140 | .block-ready | PR #3140 title-match only, unverified |
| fuel-1-planner-diagram-empty-state | NEEDS-VERIFY | 💰 |  | #2086 | .block-ready | PR #2086 title-match only, unverified |
| h-01-entity-badge-conflict | NEEDS-VERIFY | 💰 |  | #2677 | .block-ready | PR #2677 title-match only, unverified |
| h-05-home-kpi-no-date-range-toggle | NEEDS-VERIFY | 💰 |  | #3963 | .block-ready | PR #3963 title-match only, unverified |
| home-2-open-loads-inflight-late-consistency-un | NEEDS-VERIFY | 💰 |  | #2435 | .block-ready | PR #2435 title-match only, unverified |
| maint2-open-wos-kpi-table-consistency | NEEDS-VERIFY | 💰 |  | #2645 | .block-ready | PR #2645 title-match only, unverified |
| PHASE3_INVOICE-FK_unenforced-linkages_DISPATCH | NEEDS-VERIFY | 💰 |  | #2385 | .block-ready | [verified 2026-07-12] agent: not dispositioned in #2385; needs live FK check |
| PHASE3_TRANSFER-MIGRATION-DRIFT_held-but-live_VERIFY | NEEDS-VERIFY | 💰 |  | #2385 | .block-ready | [verified 2026-07-12] agent: not dispositioned in #2385; needs live migration-drift check |
| phase3-audit57-process-audit-docs-workflow | NEEDS-VERIFY | 💰 |  | #2385 | .block-ready | PR #2385 title-match only, unverified |
| phase3-audit62-spc | NEEDS-VERIFY | 💰 |  | #2385 | .block-ready | PR #2385 title-match only, unverified |
| phase3-audit64-capa | NEEDS-VERIFY | 💰 |  | #2385 | .block-ready | PR #2385 title-match only, unverified |
| phase3-audit65-preventive-action | NEEDS-VERIFY | 💰 |  | #2385 | .block-ready | PR #2385 title-match only, unverified |
| phase3-audit66-supplier-quality | NEEDS-VERIFY | 💰 |  | #2385 | .block-ready | PR #2385 title-match only, unverified |
| phase3-audit67-customer-satisfaction-csat-nps | NEEDS-VERIFY | 💰 |  | #2385 | .block-ready | PR #2385 title-match only, unverified |
| phase3-audit68-service-quality-sla | NEEDS-VERIFY | 💰 |  | #2385 | .block-ready | PR #2385 title-match only, unverified |
| phase3-audit69-product-quality | NEEDS-VERIFY | 💰 |  | #2385 | .block-ready | PR #2385 title-match only, unverified |
| phase3-audit70-manufacturing-qc | NEEDS-VERIFY | 💰 |  | #2385 | .block-ready | PR #2385 title-match only, unverified |
| phase3-audit71-laboratory | NEEDS-VERIFY | 💰 |  | #2385 | .block-ready | PR #2385 title-match only, unverified |
| phase3-audit72-calibration | NEEDS-VERIFY | 💰 |  | #2385 | .block-ready | PR #2385 title-match only, unverified |
| phase3-audit73-validation | NEEDS-VERIFY | 💰 |  | #2385 | .block-ready | PR #2385 title-match only, unverified |
| phase3-audit75-document-control | NEEDS-VERIFY | 💰 |  | #2385 | .block-ready | PR #2385 title-match only, unverified |
| product-service-categories-rename-and-creator | NEEDS-VERIFY | 💰 |  |  | .block-ready | [verified 2026-07-12] agent: parent-category creator not built (QboCategoriesListPage.tsx) |
| RECON-01 | NEEDS-VERIFY | 💰 |  | #1831 | .block-ready | PR #1831 title-match only, unverified |
| s-07-log-event-missing-dot-fields | NEEDS-VERIFY | 💰 |  | #2650 | .block-ready | PR #2650 title-match only, unverified |
| STMT-2-opening-balances | NEEDS-VERIFY | 💰 | T1 | #2227 | program | PR #2227 title-match only, unverified |
| UI-03_INLINE-CREATE-AND-BANKING-SPLIT_DISPATCH | NEEDS-VERIFY | 💰 |  | #2342 | .block-ready | [verified 2026-07-12] agent: PR #2342 Part-A vocab only; Account/COA inline-create still deferred |
| 0007-no-silent-noop-posting | DONE | 💰 |  | #2319 | .block-ready | PR #2319 merged 2026-07-11 |
| 0007-pattern-8-reverse-drill-through | DONE | 💰 |  | #2725 | .block-ready | PR #2725 merged 2026-07-19 |
| 0091-c1-1-settlement-engine-canonical | DONE | 💰 |  | #2320 | .block-ready | PR #2320 merged 2026-07-11 |
| 0091-g6-1 | DONE | 💰 |  | #2705 | .block-ready | PR #2705 merged 2026-07-19 |
| 0091-g7-1 | DONE | 💰 |  | #3068 | .block-ready | PR #3068 merged 2026-07-21 |
| 0091-g9-h6 | DONE | 💰 |  | #2711 | .block-ready | PR #2711 merged 2026-07-19 |
| 0243-d1-3-new-vendor-drawer-parity-fields | DONE |  |  | #2822 | .block-ready | PR #2822 merged 2026-07-20 |
| 0243-d4-1-samsara-webhook-driver-pairing-equip | DONE | 💰 |  |  | .block-ready | all 3 file(s) on main |
| 0243-g5-4-n-plus-1-report-loops-select-star | DONE | 💰 |  |  | .block-ready | all 4 file(s) on main |
| 0243-g8-4-a11y-input-labels | DONE | 💰 |  | #2328 | .block-ready | PR #2328 merged 2026-07-11 |
| 0243-g8-5-accounting-query-errors-wave-b | DONE | 💰 |  | #2699 | .block-ready | PR #2699 merged 2026-07-18 |
| 0243-g8-5-accounting-query-errors-wave-c | DONE | 💰 |  | #2700 | .block-ready | PR #2700 merged 2026-07-18 |
| 0243-g8-5-list-error-states | DONE | 💰 |  | #2329 | .block-ready | PR #2329 merged 2026-07-11 |
| 0243-g8-5-no-error-state-blank-forever-spinner | DONE | 💰 |  | #2698 | .block-ready | PR #2698 merged 2026-07-18 |
| 0280-02-revenue-gl-linkage | DONE | 💰 |  | #2714 | .block-ready | PR #2714 merged 2026-07-19 |
| 0280-05-factoring-balance-invoice-linkage | DONE | 💰 |  | #2724 | .block-ready | PR #2724 merged 2026-07-19 |
| 0280-15-pending-approvals-gl-linkage | DONE | 💰 |  | #2713 | .block-ready | PR #2713 merged 2026-07-19 |
| 0441-mod10-cashflow-driverpay-hardcoded-empty | DONE |  |  | #2837 | .block-ready | PR #2837 merged 2026-07-20 |
| 0441-mod10-settlement-line-ui-nonexistent-colu | DONE | 💰 |  | #2844 | .block-ready | PR #2844 merged 2026-07-20 |
| 0441-mod11-deadhead-phantom-fuel-columns | DONE |  |  | #2845 | .block-ready | PR #2845 merged 2026-07-20 |
| 0441-mod11-help-was-this-helpful-not-persisted | DONE |  |  | #2833 | .block-ready | PR #2833 merged 2026-07-20 |
| 0441-mod12-eld-export-pdf-window-print | DONE |  |  | #2847 | .block-ready | PR #2847 merged 2026-07-20 |
| 0441-mod12-legal-8of10-pages-omit-breadcrumb | DONE | 💰 |  | #2611 | .block-ready | PR #2611 merged 2026-07-17 |
| 0441-mod13-inventory-part-to-unit-none | DONE | 💰 |  | #2819 | .block-ready | PR #2819 merged 2026-07-20 |
| 0441-mod3-fuel-fraud-detector-cron-never-invok | DONE | 💰 |  | #2814 | .block-ready | PR #2814 merged 2026-07-20 |
| 0441-mod4-dispatch-chat-no-attachment-upload | DONE |  |  | #2842 | .block-ready | PR #2842 merged 2026-07-20 |
| 0441-mod4-dispatch-ocr-queue-no-reprocess-ui | DONE | 💰 |  | #2664 | .block-ready | PR #2664 merged 2026-07-17 |
| 0441-mod5-deductions-tab-wrong-content | DONE | 💰 |  | #2840 | .block-ready | PR #2840 merged 2026-07-20 |
| 0441-mod5-suspend-non-atomic | DONE |  |  |  | .block-ready | all 6 file(s) on main |
| 0441-mod6-insurance-no-driver-accident-link | DONE | 💰 |  | #2831 | .block-ready | PR #2831 merged 2026-07-20 |
| 0441-mod6-insurance-units-assets-id-mi_DISPATCH | DONE | 💰 |  | #2662 | .block-ready | PR #2662 merged 2026-07-17 |
| 0441-mod7-dispute-queue-stub | DONE | 💰 |  | #2841 | .block-ready | PR #2841 merged 2026-07-20 |
| 0441-mod8-section7-palette-violation | DONE | 💰 |  | #2856 | .block-ready | PR #2856 merged 2026-07-20 |
| 0441-mod9-coi-duplicated-feature-unequal | DONE | 💰 |  | #2824 | .block-ready | PR #2824 merged 2026-07-20 |
| 1001-program-tracker-tabs-url-sync | DONE |  |  | #2820 | .block-ready | PR #2820 merged 2026-07-20 |
| 972-anomaly-alerts-url-sync | DONE |  |  | #2777 | .block-ready | PR #2777 merged 2026-07-20 |
| A1-AUDIT-SPINE-LINK-COLUMNS | DONE | 💰 |  | #884 | .block-ready | PR #884 merged 2026-06-11 |
| A2-AUDIT-EMIT-DISPATCH | DONE |  |  | #886 | .block-ready | [verified 2026-07-12] block own verify-*.mjs guard passes on main (built+wired) |
| A3-AUDIT-EMIT-MAINTENANCE | DONE |  |  | #888 | .block-ready | [verified 2026-07-12] block own verify-*.mjs guard passes on main (built+wired) |
| A4-AUDIT-EMIT-ACCOUNTING | DONE |  |  | #889 | .block-ready | PR #889 merged 2026-06-12 |
| A5-AUDIT-EMIT-BANKING | DONE |  |  | #890 | .block-ready | [verified 2026-07-12] block own verify-*.mjs guard passes on main (built+wired) |
| A6-AUDIT-UNIVERSAL-VIEW | DONE |  |  | #891 | .block-ready | [verified 2026-07-12] block own verify-*.mjs guard passes on main (built+wired) |
| A7-AUDIT-PER-ENTITY-TABS | DONE |  |  | #909 | .block-ready | [verified 2026-07-12] block own verify-*.mjs guard passes on main (built+wired) |
| A8-AUDIT-REPORTS-SECTION | DONE |  |  | #899 | .block-ready | [verified 2026-07-12] block own verify-*.mjs guard passes on main (built+wired) |
| A9-AUDIT-CI-EMIT-GUARD | DONE |  |  | #901 | .block-ready | PR #901 merged 2026-06-12 |
| accounting-sortable-headers-guard-wiring | DONE | 💰 |  | #2732 | .block-ready | PR #2732 merged 2026-07-19 |
| ACCOUNTING-UI-POLISH | DONE | 💰 |  | #1920 | .block-ready | PR #1920 merged 2026-07-04 |
| ACCT-BLOCK-10-ACCOUNT-BALANCES | DONE |  |  | #709 | .block-ready | PR #709 merged 2026-06-08 |
| ACCT-BLOCK-11-PERIODS-INIT | DONE |  |  | #814 | .block-ready | PR #814 merged 2026-06-09 |
| ACCT-CASHFLOW-COMPANY-TZ | DONE | 💰 |  | #1676 | .block-ready | PR #1676 merged 2026-06-30 |
| ACCT-COA-CANONICALIZATION | DONE |  |  | #715 | .block-ready | PR #715 merged 2026-06-08 |
| ACCT-F05-BANKFEED-JE-MATCH | DONE | 💰 |  | #3517 | .block-ready | PR #3517 merged 2026-07-25 |
| ACCT-F10 | DONE | 💰 |  | #3500 | .block-ready | PR #3500 merged 2026-07-25 |
| acct-fmcsa-fire-and-forget-retry | DONE | 💰 |  | #2716 | .block-ready | PR #2716 merged 2026-07-19 |
| ACCT-INTEGRITY-VERIFY-EXTEND | DONE |  |  | #816 | .block-ready | PR #816 merged 2026-06-09 |
| ACCT-LINK-04-EXPENSE-CATEGORY-FK | DONE | 💰 |  | #3446 | .block-ready | PR #3446 merged 2026-07-25 |
| ACCT-QBOPAR-00-DESIGN-LOCK | DONE |  |  | #703 | .block-ready | PR #703 merged 2026-06-07 |
| ACCT-QBOPAR-01-CATALOG-BACKEND | DONE |  |  |  | .block-ready | all 16 file(s) on main |
| ACCT-QBOPAR-02 | DONE |  |  | #710 | .block-ready | PR #710 merged 2026-06-07 |
| ACCT-QBOPAR-03 | DONE |  |  | #740 | .block-ready | PR #740 merged 2026-06-08 |
| ACCT-QBOPAR-04 | DONE |  |  | #815 | .block-ready | PR #815 merged 2026-06-08 |
| ACCT-R-03-COA-MERGE-REPOINT | DONE | 💰 |  | #3526 | .block-ready | PR #3526 merged 2026-07-26 |
| AF-0-rebaseline | DONE | 💰 | T3 | #1264 | program | [verified 2026-07-03] doc block; PR #1264 doc on main |
| AF-3-account-registers | DONE | 💰 | T2 |  | program | [verified 2026-07-03] account-register routes/service + page live on main |
| AF-6-finance-hub | DONE | 💰 | T2 |  | program | [verified 2026-07-03] finance-hub routes/service + page on main (flag-gated OFF by design) |
| ap-control-test-isolation | DONE | 💰 |  | #2719 | .block-ready | PR #2719 merged 2026-07-19 |
| AR-AP-PAYMENT-CONTRACT | DONE | 💰 |  | #1923 | .block-ready | PR #1923 merged 2026-07-04 |
| at-risk-queue-error-entitylink | DONE |  |  | #2869 | .block-ready | PR #2869 merged 2026-07-20 |
| BANK-18-DESIGNVIEW-QBO-PARITY | DONE | 💰 |  | #3131 | .block-ready | all 2 file(s) on main |
| BANK-18-KEYSTONE-CATEGORIZE-REGISTER | DONE | 💰 |  | #3131 | .block-ready | all 4 file(s) on main |
| BANK-ECON-05-GATE-01 | DONE | 💰 |  | #3502 | .block-ready | PR #3502 merged 2026-07-25 |
| BANK-MODULE-DOD | DONE | 💰 |  | #3509 | .block-ready | PR #3509 merged 2026-07-25 |
| BANK-SORT-ROLLOUT-ACCT | DONE |  |  | #2602 | .block-ready | PR #2602 merged 2026-07-17 |
| BANK-SORT-ROLLOUT-ACCT-CUSTVEND | DONE |  |  | #2609 | .block-ready | PR #2609 merged 2026-07-17 |
| bank-splits-vendor-bill-gl-atomic | DONE | 💰 |  | #2717 | .block-ready | PR #2717 merged 2026-07-19 |
| banking-1-uncategorized-kpi-reconciliation | DONE | 💰 |  | #1724 | .block-ready | [verified 2026-07-11] PR #1724 merged 707ebd735 (KPI count alignment, no money movement); apps/backend/src/banking/pendi |
| BANKING-CATEGORIZE-C1 | DONE | 💰 |  | #1913 | .block-ready | PR #1913 merged 2026-07-03 |
| BANKING-CSV-DIRECTION-M6 | DONE | 💰 |  | #1915 | .block-ready | PR #1915 merged 2026-07-03 |
| BANKING-RECON-DEEPLINK-H4 | DONE | 💰 |  | #1914 | .block-ready | PR #1914 merged 2026-07-03 |
| BANKING-VIEW-POLISH-L10-H3 | DONE | 💰 |  | #1917 | .block-ready | PR #1917 merged 2026-07-04 |
| biz-flow-8-no-transfer-notifications | DONE | 💰 |  | #2821 | .block-ready | PR #2821 merged 2026-07-20 |
| BK7-INLINE-CREATE-DRAWERS | DONE |  |  | #866 | .block-ready | all 3 file(s) on main |
| BLOCK-04-of-29-TIER2-RATE-LIMIT | DONE |  | T2 |  | enterprise-29 | all 1 named artifact(s) on main |
| BLOCK-05-of-29-TIER2-CIRCUIT-BREAKERS | DONE |  | T2 |  | enterprise-29 | all 1 named artifact(s) on main |
| BLOCK-05-TIER2-CIRCUIT-BREAKERS | DONE |  |  | #800 | .block-ready | PR #800 merged 2026-06-08 |
| BLOCK-06-of-29-TIER2-OUTBOX-DLQ | DONE |  | T2 |  | enterprise-29 | all 1 named artifact(s) on main |
| BLOCK-07-of-29-TIER2-PAGINATION-AUDIT | DONE |  | T2 |  | enterprise-29 | all 1 named artifact(s) on main |
| BLOCK-08-of-29-TIER2-LOAD-TEST | DONE |  | T2 |  | enterprise-29 | all 1 named artifact(s) on main |
| BLOCK-08-TIER2-LOAD-TEST | DONE |  |  | #796 | .block-ready | PR #796 merged 2026-06-08 |
| BLOCK-09-of-29-TIER2-E2E-PATHS | DONE |  | T2 |  | enterprise-29 | all 1 named artifact(s) on main |
| BLOCK-09-TIER2-E2E-PATHS | DONE |  |  | #802 | .block-ready | PR #802 merged 2026-06-09 |
| block-10-account-balances | DONE | 💰 |  | #709 | accounting | branch feat/acct-block-10-account-balances → PR #709 merged 2026-06-08 |
| BLOCK-10-driver-inactivity | DONE |  | T1 |  | program | all 2 named artifact(s) on main |
| BLOCK-10-of-29-TIER2-RLS-TEST-GATE | DONE |  | T2 |  | enterprise-29 | all 1 named artifact(s) on main |
| BLOCK-10-TIER2-RLS-TEST-GATE | DONE |  |  | #801 | .block-ready | PR #801 merged 2026-06-09 |
| BLOCK-11-of-29-TIER2-AUDIT-COVERAGE | DONE |  | T2 |  | enterprise-29 | all 1 named artifact(s) on main |
| BLOCK-12-of-29-TIER2-DESTRUCT-PREFLIGHT | DONE |  | T2 |  | enterprise-29 | all 1 named artifact(s) on main |
| BLOCK-13-of-29-TIER2-TUNING-CATALOG | DONE |  | T2 |  | enterprise-29 | all 1 named artifact(s) on main |
| BLOCK-13-TIER2-TUNING-CATALOG | DONE |  |  | #794 | .block-ready | PR #794 merged 2026-06-08 |
| BLOCK-14-of-29-TIER2.5-MEXICO-OPS | DONE |  | T2.5 |  | enterprise-29 | all 2 named artifact(s) on main |
| BLOCK-15-of-29-TIER2.5-MECHANIC-SHOP | DONE |  | T2.5 |  | enterprise-29 | all 2 named artifact(s) on main |
| BLOCK-16-COMPLIANCE-DASHBOARD | DONE |  |  | #701 | .block-ready | PR #701 merged 2026-06-07 |
| BLOCK-16-of-29-TIER2.5-FUEL-CARD | DONE |  | T2.5 |  | enterprise-29 | all 1 named artifact(s) on main |
| BLOCK-18-of-29-TIER3-PII-ENCRYPTION | DONE |  | T3 |  | enterprise-29 | all 1 named artifact(s) on main |
| block-20-cash-basis | DONE | 💰 |  |  | accounting | all 3 named artifact(s) on main |
| block-20-frontend-selector | DONE | 💰 |  |  | accounting | all 9 named artifact(s) on main |
| BLOCK-20-of-29-TIER3-SECRETS-ROTATION | DONE |  | T3 |  | enterprise-29 | all 1 named artifact(s) on main |
| block-20-period-close-lock | DONE | 💰 |  |  | accounting | all 1 named artifact(s) on main |
| block-21-expense-category-map | DONE | 💰 |  |  | accounting | all 1 named artifact(s) on main |
| BLOCK-21-of-29-TIER3-DR-DRILL | DONE |  | T3 |  | enterprise-29 | all 1 named artifact(s) on main |
| BLOCK-22-of-29-TIER3-OPS-RUNBOOKS | DONE |  | T3 |  | enterprise-29 | all 1 named artifact(s) on main |
| block-23-escrow-posting-flow | DONE | 💰 |  |  | accounting | all 1 named artifact(s) on main |
| BLOCK-23-of-29-TIER3-DEGRADATION | DONE |  | T3 |  | enterprise-29 | all 1 named artifact(s) on main |
| block-24-factoring-posting | DONE | 💰 |  |  | accounting | all 4 named artifact(s) on main |
| block-25-factoring-fees-reserves | DONE | 💰 |  |  | accounting | all 6 named artifact(s) on main |
| block-26-factoring-reconciliation | DONE | 💰 |  |  | accounting | [verified 2026-07-12] agent: routes autoloaded + guard registry-executed (verify-architectural-design:510-513) |
| BLOCK-26-of-29-TIER4-PARTITION | DONE |  | T4 |  | enterprise-29 | all 1 named artifact(s) on main |
| block-27-fuel-expense-posting | DONE | 💰 |  |  | accounting | all 3 named artifact(s) on main |
| BLOCK-27-of-29-TIER4-CANARY | DONE |  | T4 |  | enterprise-29 | all 1 named artifact(s) on main |
| block-28-maintenance-ap-posting | DONE | 💰 |  |  | accounting | all 5 named artifact(s) on main |
| BLOCK-28-of-29-TIER4-VENDOR-LOCKIN | DONE |  | T4 |  | enterprise-29 | all 1 named artifact(s) on main |
| block-29-bank-reconciliation-engine | DONE | 💰 |  |  | accounting | all 6 named artifact(s) on main |
| BLOCK-29-of-29-TIER4-KNOWN-LIMITATIONS | DONE |  | T4 |  | enterprise-29 | all 1 named artifact(s) on main |
| block-30-bank-reconciliation-ui | DONE | 💰 |  |  | accounting | all 10 named artifact(s) on main |
| block-31-sales-tax-handling | DONE | 💰 |  |  | accounting | [verified 2026-07-12] agent: posting-engine.service.ts:545-548 tax split + 2 guards executed |
| block-33-invoice-line-revenue-mapping | DONE | 💰 |  |  | accounting | all 6 named artifact(s) on main |
| block-34-payment-application | DONE | 💰 |  |  | accounting | all 7 named artifact(s) on main |
| block-35-chart-of-accounts-roles | DONE | 💰 |  |  | accounting | all 6 named artifact(s) on main |
| block-36-multi-entity-accounting | DONE | 💰 |  |  | accounting | [verified 2026-07-12] agent: multi-entity/routes.ts + manifest.tsx:3435 route + 2 guards |
| block-37-qbo-sync-repair-pipeline | DONE | 💰 |  |  | accounting | [verified 2026-07-03] sync-state-machine + dashboard live |
| block-40-accounting-audit-trail | DONE | 💰 |  |  | accounting | [verified 2026-07-03] audit-trail routes + page live |
| block-41-posting-lineage-ui | DONE | 💰 |  |  | accounting | [verified 2026-07-12] agent: PostingLineagePage + audit-trail source-lineage endpoint live |
| block-43-live-db-schema-verification | DONE | 💰 |  |  | accounting | all 2 named artifact(s) on main |
| BLOCK-C-DEDUCTION-CAP | DONE |  |  | #692 | .block-ready | PR #692 merged 2026-06-07 |
| BLOCK-C-MIGRATION-RENAME | DONE |  |  | #698 | .block-ready | PR #698 merged 2026-06-07 |
| block-cf-cash-forecast | DONE | 💰 |  |  | accounting | all 2 named artifact(s) on main |
| block-cmc-month-close-wizard | DONE | 💰 |  |  | accounting | all 1 named artifact(s) on main |
| BLOCK-D-INSURANCE-RENEWAL | DONE |  |  | #699 | .block-ready | PR #699 merged 2026-06-07 |
| BLOCK-E-INSURANCE-FLEET | DONE |  |  | #702 | .block-ready | PR #702 merged 2026-06-07 |
| BLOCK-F-INSURANCE-CANCELLATION | DONE |  |  | #700 | .block-ready | PR #700 merged 2026-06-07 |
| BLOCK-G-COI-PDF | DONE |  |  | #696 | .block-ready | all 4 file(s) on main |
| BLOCK-H-DETENTION-NOTIFY | DONE |  |  | #693 | .block-ready | PR #693 merged 2026-06-07 |
| BLOCK-I-CI-DIST-FIX | DONE | 💰 |  | #3976 | .block-ready | all 1 file(s) on main |
| BLOCK-J-MASTER-DATA-GRANT | DONE |  |  | #1063 | .block-ready | all 2 file(s) on main |
| block-ppc-period-comparison | DONE | 💰 |  |  | accounting | all 1 named artifact(s) on main |
| BLOCK5-INSURANCE-FORWARD-FIX | DONE |  |  | #695 | .block-ready | PR #695 merged 2026-06-07 |
| BLOCK7-DRIVER-HUB-REQUESTS | DONE |  |  | #694 | .block-ready | PR #694 merged 2026-06-07 |
| BLOCKS-ACCOUNTING | DONE |  |  |  | program | all 1 named artifact(s) on main |
| BLOCKS-ACCOUNTING-DOM-2026-07-26 | DONE |  |  |  | program | all 1 named artifact(s) on main |
| BLOCKS-BANKING | DONE |  |  |  | program | all 3 named artifact(s) on main |
| BLOCKS-BANKING-DOM-2026-07-26 | DONE |  |  |  | program | all 3 named artifact(s) on main |
| BLOCKS-FACTORING | DONE |  |  |  | program | all 3 named artifact(s) on main |
| BLOCKS-INSURANCE | DONE |  |  |  | program | all 4 named artifact(s) on main |
| BLOCKS-MAINTENANCE | DONE |  |  |  | program | all 4 named artifact(s) on main |
| BLOCKS-SETTLEMENTS | DONE |  |  |  | program | all 5 named artifact(s) on main |
| bnk-03-no-last-reconciled-no-beginning-balance | DONE |  |  | #2834 | .block-ready | PR #2834 merged 2026-07-20 |
| BUG-ADD-USER-INERT | DONE |  |  | #861 | .block-ready | PR #861 merged 2026-06-10 |
| C1-PRE-SETTLEMENTS | DONE |  |  | #900 | .block-ready | PR #900 merged 2026-06-12 |
| C2-FACTORING-PROFILE | DONE |  |  | #904 | .block-ready | PR #904 merged 2026-06-12 |
| C3-CUSTOMER-CONTRACT-UPLOAD | DONE |  |  | #902 | .block-ready | PR #902 merged 2026-06-12 |
| C4-CUST-VEND-REBUILD-RECLASSIFY | DONE |  |  | #905 | .block-ready | PR #905 merged 2026-06-12 |
| C6-HOME-DASHBOARD | DONE | 💰 |  |  | .block-ready | all 3 file(s) on main |
| CAP-AUTOSTATUS | DONE |  |  |  | program | all 1 named artifact(s) on main |
| CAP-CARGOTEMP | DONE |  |  |  | program | all 2 named artifact(s) on main |
| CAP-ENGINEWO | DONE |  |  |  | program | all 2 named artifact(s) on main |
| CAP-FUELFRAUD | DONE |  |  |  | program | all 1 named artifact(s) on main |
| CAP-GPS | DONE |  |  |  | program | all 3 named artifact(s) on main |
| CAP-PREDICTIVE | DONE |  |  |  | program | all 2 named artifact(s) on main |
| CAP-SCORING | DONE |  |  |  | program | all 2 named artifact(s) on main |
| CASH-FLOW-MODULE | DONE |  |  |  | .block-ready | all 5 file(s) on main |
| CHAIN-01-vendor-picker-fix | DONE | 💰 | T2 |  | program | [verified 2026-07-03] VendorBillForm states live on main |
| CHAIN-02-account-register-params | DONE | 💰 |  |  | program | [verified 2026-07-03] AccountRegisterPage error-surface live |
| CHAIN-03-create-bill-gl-autopost | DONE | 💰 | T1 |  | program | [verified 2026-07-03] bill-gl-draft routes/service on main; posting flag OFF by design |
| CHAIN-05-bank-feed-live-proof | DONE | 💰 | T1 |  | program | [verified 2026-07-12] GUARD LIVE-VERIFIED on prod: categorized LOVES→Fuel Expense posted → accounting.journal_entries 8d |
| CHORE-MASTER-TRACKER-MD | DONE | 💰 |  | #924 | .block-ready | PR #924 merged 2026-06-13 |
| CHORE-UNVERIFIED-ROWS-RECONCILE | DONE | 💰 |  | #928 | .block-ready | PR #928 merged 2026-06-13 |
| CI-DETERMINISTIC-SCHEMA-PARITY-BASELINE | DONE | 💰 |  | #2693 | .block-ready | PR #2693 merged 2026-07-18 |
| CLOSURE-10-MAINT-PARTS-CATALOG | DONE |  |  | #798 | .block-ready | PR #798 merged 2026-06-09 |
| CLOSURE-11-MAINT-SERVICES-CATALOG | DONE |  |  | #799 | .block-ready | PR #799 merged 2026-06-08 |
| CLOSURE-12-CYCLE5-PAYROLL-INTEGRATION | DONE |  |  | #795 | .block-ready | PR #795 merged 2026-06-08 |
| CLOSURE-13-USMCA-JULY-LAUNCH | DONE |  |  | #797 | .block-ready | PR #797 merged 2026-06-08 |
| CLOSURE-16-DEEP-AUDIT-C | DONE |  |  | #793 | .block-ready | PR #793 merged 2026-06-08 |
| CLOSURE-17-ON-HOLD-TRIAGE | DONE |  |  | #788 | .block-ready | PR #788 merged 2026-06-08 |
| CLOSURE-18-PERF-AUDIT | DONE |  |  | #792 | .block-ready | PR #792 merged 2026-06-08 |
| CLOSURE-19-SEC-AUDIT | DONE |  |  | #785 | .block-ready | PR #785 merged 2026-06-08 |
| CLOSURE-20-A11Y-AUDIT | DONE |  |  | #787 | .block-ready | PR #787 merged 2026-06-09 |
| CLOSURE-21-MONITORING-SETUP | DONE |  |  | #791 | .block-ready | PR #791 merged 2026-06-10 |
| CLOSURE-23-DR-BACKUP-AUDIT | DONE |  |  | #786 | .block-ready | PR #786 merged 2026-06-08 |
| CLOSURE-24-OPERATOR-ONBOARDING | DONE |  |  | #790 | .block-ready | PR #790 merged 2026-06-09 |
| CLOSURE-25-RUNBOOKS | DONE |  |  | #789 | .block-ready | PR #789 merged 2026-06-10 |
| coder-work-order-t2-3-xlsx-cve | DONE | 💰 |  | #2686 | .block-ready | PR #2686 merged 2026-07-18 |
| compliance-1-stale-units-segregation | DONE | 💰 |  | #1720 | .block-ready | [verified 2026-07-11] PR #1720 merged a53ceabff (non-financial); apps/frontend/src/pages/compliance/FleetHosBoardSection |
| CONN-2-factoring-faro | DONE | 💰 |  |  | program | [verified 2026-07-12] agent: routes+reserve-tracker wired, migration HELD (poster.service.ts:276-530) |
| CPA-ANSWERS-PHASE1 | DONE |  |  | #2707 | .block-ready | PR #2707 merged 2026-07-19 |
| CUSTVEND-PAR-1 | DONE | 💰 |  | #2286 | .block-ready | PR #2286 merged 2026-07-08 |
| D-CAL-1-datepicker-parity | DONE | 💰 |  | #2325 | .block-ready | PR #2325 merged 2026-07-11 |
| D-CREATE-INLINE-referenceselect | DONE | 💰 |  | #2326 | .block-ready | PR #2326 merged 2026-07-11 |
| D-CREATE-VERIFY-DEAD-FORMS-UNMOUNTED | DONE |  |  |  | .block-ready | [verified 2026-07-12] verify-dead-forms-unmounted.mjs + verify-steps/110 + package.json:866; guard PASS (11 dead forms u |
| D-SECTION7-EMOJI-cleanup | DONE | 💰 |  | #2327 | .block-ready | PR #2327 merged 2026-07-11 |
| D1-SETTLEMENTS-APPROVAL-PDF | DONE |  |  | #910 | .block-ready | PR #910 merged 2026-06-12 |
| d5-driver-detail-scope-optional-param | DONE | 💰 |  | #2661 | .block-ready | PR #2661 merged 2026-07-17 |
| DESIGN-STD-NAVY-PAGE-BANNER | DONE |  |  | #898 | .block-ready | PR #898 merged 2026-06-12 |
| DISP-DRAWER-WIRE | DONE |  |  | #746 | .block-ready | PR #746 merged 2026-06-08 |
| DISP-FACTORING-PACKET | DONE |  |  | #750 | .block-ready | PR #750 merged 2026-06-08 |
| DISP-FINES-DEDUCT | DONE |  |  | #762 | .block-ready | PR #762 merged 2026-06-08 |
| DISP-KANBAN-dispatch-kanban-board | DONE |  |  |  | program | all 2 named artifact(s) on main |
| DISP-KANBAN-STATES | DONE |  |  | #751 | .block-ready | PR #751 merged 2026-06-08 |
| DISP-LIST-TABLE-ASSIGN | DONE |  |  | #758 | .block-ready | PR #758 merged 2026-06-08 |
| DISP-OVERVIEW | DONE |  |  | #752 | .block-ready | PR #752 merged 2026-06-08 |
| DISP-OVERVIEW-dispatch-overview | DONE |  |  |  | program | all 2 named artifact(s) on main |
| DISP-PLANNERS | DONE |  |  |  | .block-ready | all 11 file(s) on main |
| DISP-PROFIT-load-profitability | DONE |  |  |  | program | all 2 named artifact(s) on main |
| DISP-PROFITABILITY | DONE |  |  | #743 | .block-ready | PR #743 merged 2026-06-08 |
| DISP-QUEUES-NAV | DONE |  |  | #753 | .block-ready | PR #753 merged 2026-06-08 |
| DISP-ROUNDTRIPS | DONE |  |  | #756 | .block-ready | PR #756 merged 2026-06-08 |
| DISPATCH-LIVE-ETA | DONE |  |  | #688 | .block-ready | PR #688 merged 2026-06-07 |
| dispatch-sweep-gap-25 | DONE |  |  | #2812 | .block-ready | PR #2812 merged 2026-07-20 |
| DOC-17-DEFINITION-OF-DONE | DONE | 💰 |  | #2370 | .block-ready | all 1 file(s) on main |
| DOC-CATALOGS-ACCOUNTS-FK-INVENTORY | DONE |  |  | #1518 | .block-ready | PR #1518 merged 2026-06-26 |
| DOC-CATALOGS-CLASSES-FK-INVENTORY | DONE |  |  | #1519 | .block-ready | PR #1519 merged 2026-06-26 |
| DOCS-AUDIT-LINKAGE-SPECS | DONE |  |  | #882 | .block-ready | PR #882 merged 2026-06-11 |
| DOCS-B9-ESCROW-DESIGN | DONE |  |  | #948 | .block-ready | PR #948 merged 2026-06-14 |
| DOCS-DISPATCH-LANE-ENFORCEMENT-V2 | DONE |  |  | #742 | .block-ready | PR #742 merged 2026-06-08 |
| DOCS-FACTORING-ACCOUNTING-STRUCTURE | DONE |  |  | #738 | .block-ready | PR #738 merged 2026-06-08 |
| DOCS-FH1-FIXED-ASSETS-DEPRECIATION | DONE |  |  | #957 | .block-ready | PR #957 merged 2026-06-14 |
| DOCS-FH1-LEASING-FOLLOWUP | DONE |  |  | #967 | .block-ready | PR #967 merged 2026-06-15 |
| DOCS-FH2-LOAN-WIZARD | DONE |  |  | #959 | .block-ready | PR #959 merged 2026-06-14 |
| DOCS-FH3-AMORTIZATION-ENGINE | DONE |  |  | #958 | .block-ready | PR #958 merged 2026-06-14 |
| DOCS-FH4-FINANCE-CALCULATOR | DONE |  |  | #960 | .block-ready | PR #960 merged 2026-06-14 |
| DOCS-FH5-BANKRUPTCY-MODELER | DONE |  |  | #963 | .block-ready | PR #963 merged 2026-06-14 |
| DOCS-FH5-POSTING-LOCKED | DONE |  |  | #969 | .block-ready | PR #969 merged 2026-06-15 |
| DOCS-FH6-TAX-MANAGER | DONE |  |  | #961 | .block-ready | PR #961 merged 2026-06-14 |
| DOCS-FH7-UNIT-ALLOCATION | DONE |  |  | #962 | .block-ready | PR #962 merged 2026-06-14 |
| DOCS-FH8-LEASE-CONTRACT | DONE |  |  | #965 | .block-ready | PR #965 merged 2026-06-15 |
| DOCS-FINANCE-ANSWERED-QS-FOLLOWUP | DONE |  |  | #968 | .block-ready | PR #968 merged 2026-06-15 |
| DOCS-GEOFENCE-INSURANCE-SPEC | DONE |  |  | #719 | .block-ready | PR #719 merged 2026-06-08 |
| DOCS-MILEAGE-LIFECYCLE-CORRECTION | DONE |  |  | #954 | .block-ready | PR #954 merged 2026-06-14 |
| DOCS-MILEAGE-MODEL-ANSWERS | DONE |  |  | #946 | .block-ready | PR #946 merged 2026-06-14 |
| DOCS-MILEAGE-MODEL-DESIGN | DONE |  |  | #943 | .block-ready | PR #943 merged 2026-06-14 |
| DOCS-PERMISSIONS-DESIGN | DONE |  |  | #953 | .block-ready | PR #953 merged 2026-06-14 |
| DOCS-QBO-PARITY-CAPTURE-V2 | DONE |  |  | #826 | .block-ready | PR #826 merged 2026-06-09 |
| DOCS-RECON-TRACKER-ESCROW-RESEARCH-0614 | DONE |  |  | #937 | .block-ready | PR #937 merged 2026-06-14 |
| DOCS-RELAY-INTERNAL-BANK-DESIGN | DONE |  |  | #956 | .block-ready | PR #956 merged 2026-06-14 |
| DOCS-RLS-COVERAGE-AUDIT | DONE |  |  | #947 | .block-ready | PR #947 merged 2026-06-14 |
| DOCS-ROLE-BINDINGS-WORKSHEET | DONE |  |  | #716 | .block-ready | PR #716 merged 2026-06-08 |
| DOCS-VOID-EVERYWHERE-DESIGN | DONE |  |  | #964 | .block-ready | PR #964 merged 2026-06-14 |
| driverhub-2-demo-duplicate-drivers-cleanup | DONE | 💰 |  | #1721 | .block-ready | [verified 2026-07-11] PR #1721 merged 27cf6a9ce; demo-data-exclusion guard test + units.routes.ts/driver-scheduler.servi |
| E1-SMOKE-SERVICE-TOKEN-AUTH | DONE |  |  | #906 | .block-ready | [verified 2026-07-12] block own verify-*.mjs guard passes on main (built+wired) |
| entitylink-driver-load-history | DONE |  |  | #2854 | .block-ready | PR #2854 merged 2026-07-20 |
| expenses-list-route-still-shows-create-wizard | DONE | 💰 |  |  | .block-ready | all 13 file(s) on main |
| FACT-FIX-1 | DONE |  |  | #2278 | .block-ready | PR #2278 merged 2026-07-07 |
| fact-fix1-duplicate-vendors-banner | DONE | 💰 |  | #2813 | .block-ready | PR #2813 merged 2026-07-20 |
| FACT-PAR-1 | DONE | 💰 |  | #2287 | .block-ready | PR #2287 merged 2026-07-08 |
| FACT-PAR-2 | DONE |  |  | #2282 | .block-ready | PR #2282 merged 2026-07-07 |
| fact-par1-submissionqueue-unrouted | DONE |  |  | #2816 | .block-ready | PR #2816 merged 2026-07-20 |
| FEAT-ACCOUNT-REGISTER-D5 | DONE |  |  | #976 | .block-ready | PR #976 merged 2026-06-15 |
| FEAT-B1-EXPENSE-CATEGORY-MAP-SEED | DONE |  |  | #918 | .block-ready | PR #918 merged 2026-06-13 |
| FEAT-B2-POSTING-ENGINE-CASH-ADVANCE | DONE |  |  | #919 | .block-ready | PR #919 merged 2026-06-13 |
| FEAT-B3-EMPLOYEE-LOAN-LEDGER | DONE |  |  | #920 | .block-ready | PR #920 merged 2026-06-13 |
| FEAT-B4-DRIVER-REQUEST-AUDIT-TIMELINE | DONE |  |  | #921 | .block-ready | PR #921 merged 2026-06-13 |
| FEAT-B5-CASH-ADVANCE-APPROVE-CASCADE | DONE |  |  | #922 | .block-ready | PR #922 merged 2026-06-13 |
| FEAT-B6-DRIVER-INBOX-UI | DONE | 💰 |  | #923 | .block-ready | PR #923 merged 2026-06-13 |
| FEAT-CLASSES-BULK-EDIT | DONE |  |  | #952 | .block-ready | PR #952 merged 2026-06-14 |
| FEAT-DISP-CASHFLOW-LINK | DONE |  |  | #744 | .block-ready | PR #744 merged 2026-06-08 |
| FEAT-DISP-DRAWER-WIRE | DONE |  |  | #746 | .block-ready | PR #746 merged 2026-06-08 |
| FEAT-DISPATCH-PLANNERS-SPLIT-NAV | DONE |  |  | #944 | .block-ready | PR #944 merged 2026-06-14 |
| FEAT-DOCS-UPLOAD-UI | DONE |  |  | #949 | .block-ready | PR #949 merged 2026-06-14 |
| FEAT-DRIVER-ESCROW-SUBACCOUNT-V2 | DONE | 💰 |  | #934 | .block-ready | PR #934 merged 2026-06-14 |
| FEAT-DRIVER-HUB-ROUTE-WIRE | DONE |  |  | #822 | .block-ready | PR #822 merged 2026-06-09 |
| FEAT-DRIVER-INBOX-REPORTING | DONE |  |  | #951 | .block-ready | PR #951 merged 2026-06-14 |
| FEAT-DRIVER-SUBACCOUNT-ASSET-PROVISION | DONE | 💰 |  | #933 | .block-ready | PR #933 merged 2026-06-14 |
| FEAT-DRIVER-SUBACCOUNT-BULK-BACKFILL-DRYRUN | DONE | 💰 |  | #935 | .block-ready | PR #935 merged 2026-06-14 |
| FEAT-EXPENSES-PHASE1-5-BUILD | DONE | 💰 |  | #1008 | .block-ready | PR #1008 merged 2026-06-15 |
| FEAT-EXPENSES-PHASE1-FOUNDATION | DONE | 💰 |  | #1006 | .block-ready | PR #1006 merged 2026-06-15 |
| FEAT-EXPENSES-PHASE2-STEP3-POSTING-BUILD | DONE | 💰 |  | #1018 | .block-ready | PR #1018 merged 2026-06-15 |
| FEAT-EXPENSES-PHASE2-UNCATEGORIZED-SEED | DONE | 💰 |  | #1015 | .block-ready | PR #1015 merged 2026-06-15 |
| FEAT-FH-2-LOAN-WIZARD | DONE | 💰 |  | #1023 | .block-ready | PR #1023 merged 2026-06-16 |
| FEAT-FH-3-AMORTIZATION | DONE | 💰 |  | #1026 | .block-ready | PR #1026 merged 2026-06-16 |
| FEAT-FH-4-CALCULATOR | DONE | 💰 |  | #1027 | .block-ready | PR #1027 merged 2026-06-16 |
| FEAT-FH1-FIXED-ASSETS-DATA-MODEL | DONE | 💰 |  | #1017 | .block-ready | PR #1017 merged 2026-06-15 |
| FEAT-HELP-ARTICLE-STUBS | DONE |  |  | #950 | .block-ready | PR #950 merged 2026-06-14 |
| FEAT-HIDE-STUB-NAV-PAGES | DONE |  |  | #945 | .block-ready | PR #945 merged 2026-06-14 |
| FEAT-INSURANCE-POLICY-WIZARD | DONE |  |  | #737 | .block-ready | PR #737 merged 2026-06-08 |
| FEAT-INVENTORY-PARTS-404-FIX | DONE | 💰 |  | #926 | .block-ready | PR #926 merged 2026-06-13 |
| FEAT-PERIODS-INIT-TRK-2025-H2 | DONE | 💰 |  | #927 | .block-ready | PR #927 merged 2026-06-13 |
| FEAT-QBO-PARITY-A1-TABLE-GRAMMAR | DONE |  |  | #824 | .block-ready | PR #824 merged 2026-06-09 |
| FEAT-QBO-PARITY-A3-SIZING | DONE |  |  | #825 | .block-ready | PR #825 merged 2026-06-09 |
| FEAT-QBO-PARITY-DOCS | DONE |  |  | #823 | .block-ready | PR #823 merged 2026-06-09 |
| FEAT-REEFER-HOURS-POLL-CRON | DONE |  |  | #942 | .block-ready | PR #942 merged 2026-06-14 |
| FEAT-SETTLEMENT-DEDUCTION-LEDGER-DDL | DONE | 💰 |  | #925 | .block-ready | PR #925 merged 2026-06-13 |
| FEAT-SETTLEMENT-RECOVERY-CAPPED-PAYROLL | DONE | 💰 |  | #929 | .block-ready | PR #929 merged 2026-06-14 |
| FEAT-SETTLEMENT-RECOVERY-CAPPED-WIRING | DONE | 💰 |  | #930 | .block-ready | PR #930 merged 2026-06-14 |
| FEAT-SETTLEMENT-RECOVERY-GL-JE | DONE | 💰 |  | #931 | .block-ready | PR #931 merged 2026-06-14 |
| FEAT-SETTLEMENT-SHADOW-RUN | DONE | 💰 |  | #932 | .block-ready | PR #932 merged 2026-06-14 |
| FEAT-SIDEBAR-V2-REORG-25 | DONE |  |  | #859 | .block-ready | [verified 2026-07-12] block own verify-*.mjs guard passes on main (built+wired) |
| FEAT-TASK-BOARD-CREATE-TASK-UI | DONE |  |  | #940 | .block-ready | PR #940 merged 2026-06-14 |
| FEAT-TRACKER-EXPORT-GITHUB-TABS | DONE |  |  | #941 | .block-ready | PR #941 merged 2026-06-14 |
| FEAT-V0-SIDEBAR-DRIVER-HUB | DONE |  |  | #827 | .block-ready | PR #827 merged 2026-06-09 |
| FEAT-V2-A2-REFERENCE-SELECT | DONE |  |  | #828 | .block-ready | PR #828 merged 2026-06-09 |
| FEAT-VOID-EVERYWHERE-PR1 | DONE | 💰 |  | #973 | .block-ready | PR #973 merged 2026-06-15 |
| FEAT-VOID-EVERYWHERE-PR2 | DONE | 💰 |  | #977 | .block-ready | PR #977 merged 2026-06-15 |
| FINAL-ADDITIONS-PAGE | DONE | 💰 |  | #1924 | .block-ready | PR #1924 merged 2026-07-04 |
| FIX-01-CUSTOMER-VENDOR-LIST-RESIZE-QBO | DONE | 💰 |  |  | .block-ready | [verified 2026-07-11] merged + deployed to prod (owner-approved / non-financial ship-on-green) 2026-07-11 |
| FIX-02-CATEGORY-CREATE-FULL-COA-WIZARD | DONE | 💰 |  | #2351 | .block-ready | [verified 2026-07-11] merged + deployed to prod (owner-approved / non-financial ship-on-green) 2026-07-11 |
| FIX-03-PRODUCTS-SERVICES-ACCOUNT-LINK | DONE | 💰 |  | #2353 | .block-ready | [verified 2026-07-11] merged + deployed to prod (owner-approved / non-financial ship-on-green) 2026-07-11 |
| FIX-04-BANKING-FROM-TO-ACCOUNTS | DONE | 💰 |  | #2349 | .block-ready | [verified 2026-07-11] merged + deployed to prod (owner-approved / non-financial ship-on-green) 2026-07-11 |
| FIX-06-INLINE-CREATE-COVERAGE-SWEEP | DONE | 💰 |  | #2356 | .block-ready | [verified 2026-07-11] merged + deployed to prod (owner-approved / non-financial ship-on-green) 2026-07-11 |
| FIX-06-referenceselect-inline-create-sweep | DONE | 💰 |  | #2356 | .block-ready | [verified 2026-07-11] PR #2356 merged 1a74e671d; scripts/verify-referenceselect-coverage-ratchet.mjs guard + step 113 wi |
| FIX-10-PROGRAM-TRACKER-DEFAULT-ROUTE | DONE | 💰 |  | #2350 | .block-ready | [verified 2026-07-11] merged + deployed to prod 2026-07-11 |
| FIX-11-TRACKER-BYMODULE-COLUMNS | DONE | 💰 |  | #2352 | .block-ready | [verified 2026-07-11] merged + deployed to prod 2026-07-11 |
| FIX-19B-EXPENSES-CATEGORY-INLINE-CREATE | DONE | 💰 |  |  | .block-ready | all 2 file(s) on main |
| FIX-425C-PETITION-DATE | DONE | 💰 |  | #2563 | .block-ready | PR #2563 merged 2026-07-16 |
| FIX-AT-RISK-LOADS-SD-CITY | DONE |  |  | #820 | .block-ready | PR #820 merged 2026-06-08 |
| FIX-AUDIT-KPI-DRIFTS | DONE |  |  | #857 | .block-ready | PR #857 merged 2026-06-10 |
| FIX-AUDIT-NESTED-MODALS | DONE |  |  | #853 | .block-ready | PR #853 merged 2026-06-10 |
| FIX-AUDIT-PROD-STUBS | DONE |  |  | #855 | .block-ready | PR #855 merged 2026-06-10 |
| FIX-AUDIT-TEST-DATA-LEAK | DONE |  |  | #854 | .block-ready | PR #854 merged 2026-06-10 |
| FIX-AUDIT-TRIGGER-DRIFT | DONE |  |  |  | .block-ready | all 1 file(s) on main |
| FIX-CANARY-SMOKE-DURABLE | DONE |  |  |  | .block-ready | all 1 file(s) on main |
| FIX-CI-YML-CONFLICT-MARKERS | DONE | 💰 |  | #875 | .block-ready | PR #875 merged 2026-06-11 |
| FIX-COA-UNCATEGORIZED-EXPENSE-QBO-RECONCILE | DONE | 💰 |  | #1019 | .block-ready | PR #1019 merged 2026-06-15 |
| FIX-CUSTOMER-INVOICE-CUSTOMER-ID-DEEPLINK | DONE | 💰 |  | #2592 | .block-ready | PR #2592 merged 2026-07-16 |
| FIX-DEPLOY-MIGRATION-DRIFT | DONE | 💰 |  | #878 | .block-ready | PR #878 merged 2026-06-11 |
| FIX-DISPATCH-DRIVER-PICKER-50-CAP | DONE |  |  | #1530 | .block-ready | [verified 2026-07-12] InlineDriverPicker.tsx:26 + BookLoadEquipmentSection.tsx:92 pass limit:200 |
| FIX-DISPATCH-FACTORING-QUEUE-DEEPLINKS | DONE | 💰 |  | #2593 | .block-ready | PR #2593 merged 2026-07-17 |
| FIX-DISPATCH-SUBNAV-ROUTING | DONE |  |  | #818 | .block-ready | PR #818 merged 2026-06-08 |
| FIX-DOUBLE-STRINGIFY-SWEEP-NONMONEY | DONE |  |  | #975 | .block-ready | PR #975 merged 2026-06-15 |
| FIX-DRIVERS-FULL-NAME-PHANTOM | DONE |  |  | #1534 | .block-ready | [verified 2026-07-12] no d.full_name refs remain; guard test driver-full-name-phantom.db.test.ts asserts count=0 |
| FIX-FINANCE-DOUBLE-STRINGIFY-SWEEP | DONE |  |  | #971 | .block-ready | PR #971 merged 2026-06-15 |
| FIX-FUEL-SUBNAV-ROUTING | DONE |  |  | #817 | .block-ready | PR #817 merged 2026-06-08 |
| FIX-GUARD-M2-FK-DETECTION | DONE |  |  | #917 | .block-ready | PR #917 merged 2026-06-13 |
| FIX-INSURANCE-POLICY-UNIT-IS-ACTIVE | DONE | 💰 |  | #1011 | .block-ready | PR #1011 merged 2026-06-15 |
| FIX-LEGAL-FLEET-VEHICLE-TYPE-PHANTOM | DONE |  |  | #1520 | .block-ready | [verified 2026-07-12] lease-to-own.service.ts:131 selects real u.vehicle_type AS unit_type + guard test |
| FIX-MAINTENANCE-SERVICES-ETA-PHANTOM | DONE |  |  | #1532 | .block-ready | [verified 2026-07-12] services.routes.ts:107/118 repointed to telematics.vehicle_latest_position + maintenance.pm_schedu |
| FIX-P8-AUDIT-NESTED-MODALS | DONE |  |  | #907 | .block-ready | PR #907 merged 2026-06-12 |
| FIX-PER-TRUCK-CPM-PERMITS-CTE | DONE |  |  | #1517 | .block-ready | [verified 2026-07-12] cpm-calculator.service.ts:107 repointed to master_data.unit_permits (migration 0407) |
| FIX-PICKERS-50-CAP-UNITS-VENDORS-CUSTOMERS | DONE |  |  | #1533 | .block-ready | [verified 2026-07-12] api/mdata.ts:26 forwards limit; InlineUnitPicker/InlineTrailerPicker limit:500 |
| FIX-REMOVE-LEFT-SIDEBAR-HOVER-DROPDOWN | DONE |  |  | #974 | .block-ready | PR #974 merged 2026-06-15 |
| FIX-REQUIRED-CHECKS-GATE | DONE |  |  |  | .block-ready | all 1 file(s) on main |
| FIX-RLS-BILL-EXPENSE-LINES | DONE |  |  | #714 | .block-ready | PR #714 merged 2026-06-08 |
| FIX-SAFETY-HOME-KPI-DRILLTHROUGH | DONE |  |  | #2615 | .block-ready | PR #2615 merged 2026-07-17 |
| FIX-SAFETY-NAV-COUNT | DONE |  |  |  | .block-ready | all 1 file(s) on main |
| FIX-SAMSARA-WEBHOOKS-INVESTIGATION | DONE |  |  | #856 | .block-ready | PR #856 merged 2026-06-10 |
| FIX-STEP3-POSTING-BALANCED-JE-PROOF | DONE | 💰 |  | #1021 | .block-ready | PR #1021 merged 2026-06-15 |
| FIX-TASK-CREATE-DOUBLE-STRINGIFY | DONE |  |  | #970 | .block-ready | PR #970 merged 2026-06-15 |
| FIX-TEST-JSDOM-ENV-MISSING | DONE |  |  | #863 | .block-ready | PR #863 merged 2026-06-10 |
| FIX-URL-NORMALIZE | DONE |  |  | #819 | .block-ready | PR #819 merged 2026-06-08 |
| FOLLOWUP-SPECS-2026-06-07 | DONE |  |  | #689 | .block-ready | PR #689 merged 2026-06-07 |
| G1-verify-block-registry-complete | DONE | 💰 |  | #2316 | .block-ready | PR #2316 merged 2026-07-11 |
| G11-1-CLAIM-CROSSMODULE-FKS | DONE | 💰 |  | #2487 | .block-ready | PR #2487 merged 2026-07-14 |
| G2-verify-block-acceptance | DONE | 💰 |  | #2317 | .block-ready | PR #2317 merged 2026-07-11 |
| G3-verify-guard-wired | DONE | 💰 |  | #2318 | .block-ready | PR #2318 merged 2026-07-11 |
| G4-verify-canonical-table-writes | DONE | 💰 |  | #2321 | .block-ready | PR #2321 merged 2026-07-11 |
| GAP-10-DELTA-CANCELLATIONS-REPORT | DONE |  |  | #663 | .block-ready | PR #663 merged 2026-06-07 |
| GAP-11-DELTA-UPLOAD-EXPENSE | DONE |  |  | #666 | .block-ready | PR #666 merged 2026-06-07 |
| GAP-14-PRE-DISPATCH-VALIDATION | DONE |  |  | #1150 | .block-ready | all 6 file(s) on main |
| gap-14-validation-pre-dispatch | DONE |  |  |  | gap-spec | all 6 named artifact(s) on main |
| GAP-18-DRIVER-COMM-TIMELINE | DONE | 💰 |  | #682 | .block-ready | PR #682 merged 2026-06-07 |
| GAP-19-DETENTION-INVOICE | DONE |  |  | #686 | .block-ready | PR #686 merged 2026-06-07 |
| GAP-20 | DONE |  |  | #704 | .block-ready | PR #704 merged 2026-06-07 |
| gap-20-recurring-bills | DONE |  |  |  | gap-spec | all 2 named artifact(s) on main |
| GAP-23 | DONE |  |  | #662 | .block-ready | [verified 2026-07-12] block own verify-*.mjs guard passes on main (built+wired) |
| gap-23-samsara-cache-tiers | DONE |  |  |  | gap-spec | all 2 named artifact(s) on main |
| GAP-24-FRESHNESS-INDICATOR | DONE |  |  | #685 | .block-ready | PR #685 merged 2026-06-07 |
| GAP-25 | DONE |  |  | #707 | .block-ready | PR #707 merged 2026-06-08 |
| gap-25-active-driver-set | DONE |  |  |  | gap-spec | all 3 named artifact(s) on main |
| GAP-26 | DONE | 💰 |  | #722 | .block-ready | PR #722 merged 2026-06-08 |
| gap-26-border-crossings | DONE |  |  |  | gap-spec | all 2 named artifact(s) on main |
| GAP-27 | DONE | 💰 |  | #724 | .block-ready | PR #724 merged 2026-06-08 |
| gap-27-geofence-reconciliation | DONE |  |  |  | gap-spec | all 2 named artifact(s) on main |
| GAP-28 | DONE | 💰 |  | #3987 | .block-ready | all 9 file(s) on main |
| gap-28-layover-detection | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-29 | DONE | 💰 |  | #729 | .block-ready | all 7 file(s) on main |
| gap-29-booking-gap-analytics | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-30 | DONE |  |  | #665 | .block-ready | PR #665 merged 2026-06-07 |
| gap-30-late-arrival-analytics | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-31 | DONE |  |  | #761 | .block-ready | PR #761 merged 2026-06-08 |
| gap-31-multi-stop-extra-rates | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-32 | DONE |  |  | #760 | .block-ready | PR #760 merged 2026-06-08 |
| gap-32-customer-free-time-detention | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-34 | DONE |  |  | #667 | .block-ready | PR #667 merged 2026-06-07 |
| gap-34-driver-pwa-dispatch | DONE |  |  |  | gap-spec | all 2 named artifact(s) on main |
| GAP-36 | DONE |  |  | #759 | .block-ready | PR #759 merged 2026-06-08 |
| gap-36-driver-pwa-incident-full | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-37 | DONE |  |  | #765 | .block-ready | PR #765 merged 2026-06-08 |
| gap-37-equipment-dual-confirm-transfer | DONE |  |  |  | gap-spec | all 5 named artifact(s) on main |
| GAP-38-DAMAGE-INSURANCE-CONTINUITY | DONE |  |  | #671 | .block-ready | PR #671 merged 2026-06-07 |
| GAP-39 | DONE |  |  | #669 | .block-ready | PR #669 merged 2026-06-07 |
| gap-39-geofence-state-machine | DONE |  |  |  | gap-spec | all 2 named artifact(s) on main |
| GAP-40 | DONE |  |  | #673 | .block-ready | PR #673 merged 2026-06-07 |
| gap-40-damage-photo-exif-chain | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-41 | DONE |  |  | #672 | .block-ready | PR #672 merged 2026-06-07 |
| gap-41-reports-hub-9-categories | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-42 | DONE |  |  | #767 | .block-ready | PR #767 merged 2026-06-08 |
| gap-42-ifta-quarterly-preparer | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-43 | DONE |  |  | #768 | .block-ready | PR #768 merged 2026-06-08 |
| gap-43-scheduled-reports | DONE |  |  |  | gap-spec | all 5 named artifact(s) on main |
| GAP-44 | DONE |  |  | #674 | .block-ready | PR #674 merged 2026-06-07 |
| gap-44-form-425c-exhibits | DONE |  |  |  | gap-spec | all 2 named artifact(s) on main |
| GAP-45 | DONE |  |  | #763 | .block-ready | PR #763 merged 2026-06-08 |
| gap-45-cash-flow-cpm-routes | DONE |  |  |  | gap-spec | all 2 named artifact(s) on main |
| GAP-46 | DONE |  |  | #769 | .block-ready | PR #769 merged 2026-06-08 |
| gap-46-anomaly-detection | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-47 | DONE |  |  | #770 | .block-ready | PR #770 merged 2026-06-08 |
| gap-47-dispatch-auth-gates | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-48 | DONE |  |  | #676 | .block-ready | PR #676 merged 2026-06-07 |
| gap-48-driver-operations-depth | DONE |  |  |  | gap-spec | all 2 named artifact(s) on main |
| GAP-49 | DONE |  |  | #675 | .block-ready | PR #675 merged 2026-06-07 |
| gap-49-dvir-severity-tagging | DONE |  |  |  | gap-spec | all 10 named artifact(s) on main |
| GAP-50 | DONE |  |  | #677 | .block-ready | PR #677 merged 2026-06-07 |
| gap-50-ai-photo-comparison | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-51 | DONE |  |  | #772 | .block-ready | PR #772 merged 2026-06-08 |
| GAP-52 | DONE |  |  | #773 | .block-ready | PR #773 merged 2026-06-08 |
| gap-52-driver-vendor-mapping-integrity | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-53 | DONE |  |  | #774 | .block-ready | PR #774 merged 2026-06-08 |
| gap-53-bank-multi-company-drift | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-54 | DONE |  |  | #775 | .block-ready | PR #775 merged 2026-06-08 |
| gap-54-wf-051-250-foot-correction | DONE |  |  |  | gap-spec | all 2 named artifact(s) on main |
| GAP-55 | DONE |  |  | #776 | .block-ready | PR #776 merged 2026-06-08 |
| gap-55-cap-1-live-gps | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-56 | DONE |  |  | #779 | .block-ready | PR #779 merged 2026-06-08 |
| gap-56-cap-4-auto-status-switch | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-57 | DONE |  |  | #781 | .block-ready | PR #781 merged 2026-06-08 |
| gap-57-cap-5-tri-signal | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-58 | DONE |  |  | #777 | .block-ready | PR #777 merged 2026-06-08 |
| gap-58-cap-8-engine-fault-auto-wo | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-59 | DONE |  |  | #778 | .block-ready | PR #778 merged 2026-06-08 |
| gap-59-cap-9-vehicle-driver-pairing | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-60 | DONE |  |  | #780 | .block-ready | PR #780 merged 2026-06-08 |
| gap-60-cap-10-driver-scoring | DONE |  |  |  | gap-spec | all 6 named artifact(s) on main |
| GAP-61 | DONE |  |  | #681 | .block-ready | PR #681 merged 2026-06-07 |
| gap-61-cap-11-fuel-fraud-alerts | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-62-CAP-12-TIRE-TREAD | DONE |  |  | #679 | .block-ready | PR #679 merged 2026-06-07 |
| GAP-63 | DONE |  |  | #678 | .block-ready | PR #678 merged 2026-06-07 |
| gap-63-cap-13-brake-wear | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-64 | DONE |  |  | #783 | .block-ready | PR #783 merged 2026-06-08 |
| gap-64-cap-14-cargo-sensors | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| gap-65-owner-todays-attention | DONE |  |  |  | gap-spec | all 10 named artifact(s) on main |
| GAP-66-DISPATCHER-HOME | DONE |  |  |  | .block-ready | all 13 file(s) on main |
| gap-66-dispatcher-home-view | DONE |  |  |  | gap-spec | all 4 named artifact(s) on main |
| GAP-67-ACCOUNTING-HOME | DONE |  |  | #652 | .block-ready | PR #652 merged 2026-06-07 |
| gap-67-accounting-home-view | DONE |  |  |  | gap-spec | all 2 named artifact(s) on main |
| GAP-68-SAFETY-OFFICER-HOME | DONE |  |  | #653 | .block-ready | PR #653 merged 2026-06-07 |
| gap-68-safety-officer-home-view | DONE |  |  |  | gap-spec | all 7 named artifact(s) on main |
| GAP-69-DRIVER-MANAGER-HOME | DONE |  |  | #654 | .block-ready | PR #654 merged 2026-06-07 |
| gap-69-driver-manager-home-view | DONE |  |  |  | gap-spec | all 7 named artifact(s) on main |
| GAP-7 | DONE |  |  | #660 | .block-ready | PR #660 merged 2026-06-07 |
| gap-7-severe-repair-oos-estimate | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-70 | DONE |  |  | #691 | .block-ready | PR #691 merged 2026-06-07 |
| gap-70-edi-foundation | DONE |  |  |  | gap-spec | all 2 named artifact(s) on main |
| GAP-71 | DONE |  |  | #784 | .block-ready | PR #784 merged 2026-06-08 |
| gap-71-driver-retention-model | DONE |  |  |  | gap-spec | all 2 named artifact(s) on main |
| GAP-72 | DONE |  |  | #782 | .block-ready | PR #782 merged 2026-06-08 |
| gap-72-customer-relationship-score | DONE |  |  |  | gap-spec | all 7 named artifact(s) on main |
| GAP-76 | DONE |  |  | #844 | .block-ready | all 7 file(s) on main |
| gap-76-deadhead-optimizer | DONE |  |  |  | gap-spec | all 2 named artifact(s) on main |
| GAP-8 | DONE |  |  | #661 | .block-ready | PR #661 merged 2026-06-07 |
| gap-8-assignments-quicksave | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| gap-81-drug-alcohol-program | DONE |  |  |  | gap-spec | all 3 named artifact(s) on main |
| gap-82-cert-expiry-tracking | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-82-MEDICAL-CARD-TRACKING | DONE |  |  |  | .block-ready | all 11 file(s) on main |
| gap-83-eld-audit-trail | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-83-ELD-AUDIT-VIEWER | DONE |  |  |  | .block-ready | all 13 file(s) on main |
| GAP-84-DOT-INSPECTION-GAP-CLOSE | DONE |  |  | #649 | .block-ready | PR #649 merged 2026-06-07 |
| GAP-85-PERMIT-TOLL-TRACKING | DONE |  |  | #655 | .block-ready | PR #655 merged 2026-06-07 |
| gap-85-permits-toll-tags | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-86-INSURANCE-BILL-CREATOR | DONE |  |  | #687 | .block-ready | PR #687 merged 2026-06-07 |
| gap-86-insurance-module | DONE |  |  |  | gap-spec | all 3 named artifact(s) on main |
| GAP-86-POLICY-WIZARD | DONE |  |  | #737 | .block-ready | PR #737 merged 2026-06-08 |
| gap-87-audit-log-viewer | DONE |  |  |  | gap-spec | all 6 named artifact(s) on main |
| gap-89-cmd-k-quick-switcher | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-89-UNIVERSAL-SEARCH-CMD-K | DONE |  |  | #657 | .block-ready | PR #657 merged 2026-06-07 |
| GAP-91-MOBILE-RESPONSIVE-AUDIT | DONE |  |  | #658 | .block-ready | PR #658 merged 2026-06-07 |
| GAP-92-FEATURE-FLAG-SYSTEM | DONE |  |  | #659 | .block-ready | PR #659 merged 2026-06-07 |
| gap-92-feature-flags | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-CI-WIRE-PREPUSH-GUARDS | DONE |  |  | #897 | .block-ready | PR #897 merged 2026-06-12 |
| GAP-DOUBLE-ENTRY-DB-ENFORCEMENT | DONE |  |  | #708 | .block-ready | PR #708 merged 2026-06-07 |
| GAP-E-PLANNER-TASKS-ROUTES | DONE |  |  | #885 | .block-ready | PR #885 merged 2026-06-12 |
| GAP-IDEMP-KEYS | DONE |  |  | #737 | .block-ready | PR #737 merged 2026-06-08 |
| GAP-PREMERGE-GATES-EXPAND | DONE |  |  | #651 | .block-ready | PR #651 merged 2026-06-07 |
| GLOBAL-SORT-RULE | DONE |  |  | #723 | .block-ready | PR #723 merged 2026-06-08 |
| h-02-qbo-sync-stale-no-action | DONE | 💰 |  | #2674 | .block-ready | PR #2674 merged 2026-07-17 |
| home-7-qbo-vendor-count-single-source | DONE | 💰 |  | #1722 | .block-ready | [verified 2026-07-12] agent: fixed PR #1668 (DefaultHome.tsx:168, OwnerHome.tsx:181) |
| HOS-BUG-DRIVERASSIGN | DONE |  | T2 |  | program | all 2 named artifact(s) on main |
| HOS-VIEWER-DONE | DONE |  |  |  | program | all 3 named artifact(s) on main |
| HOTFIX-0327-MIGRATION-ROLE | DONE |  |  |  | .block-ready | all 5 file(s) on main |
| IMPORT-0 | DONE |  |  | #1796 | .block-ready | [verified 2026-07-12] block own verify-*.mjs guard passes on main (built+wired) |
| IMPORT-P0 | DONE | 💰 |  | #1797 | .block-ready | [verified 2026-07-12] merged PR #1797 |
| IMPORT-P0b | DONE | 💰 |  | #1802 | .block-ready | [verified 2026-07-12] merged PR #1802 |
| INS-MODULE | DONE |  |  |  | program | all 3 named artifact(s) on main |
| insurance-2-breadcrumb-desync | DONE | 💰 |  | #2830 | .block-ready | PR #2830 merged 2026-07-20 |
| ITEM-13-CEREMONY-VALIDATE-FKS | DONE | 💰 |  | #2368 | .block-ready | [verified 2026-07-11] 8 ceremony FKs convalidated=true on prod br-fancy-credit-akjnd07a (Neon MCP read-only) |
| ITEM-14-TXN-COMPANY-ISOLATION-GUARD | DONE | 💰 |  | #2363 | .block-ready | [verified 2026-07-11] prod: all accounting/banking/driver_finance policies scope to app.operating_company_id, 0 gaps; gu |
| ITEM1-TWO-SIDED-ITEM | DONE | 💰 |  | #867 | .block-ready | all 2 file(s) on main |
| item18-bills-mdata-vendor-fk | DONE | 💰 |  | #2333 | .block-ready | PR #2333 merged 2026-07-11 |
| late-arrivals-error-entitylink | DONE |  |  | #2861 | .block-ready | PR #2861 merged 2026-07-20 |
| LOCKDOWN-ENFORCEMENT-GUARDS | DONE |  |  | #755 | .block-ready | PR #755 merged 2026-06-08 |
| m-01-wo-create-duplicate-header-fields | DONE | 💰 |  | #2304 | .block-ready | [verified 2026-07-11] PR #2304 merged f869528c4 (non-financial WO-modal visual sweep); apps/frontend/src/pages/maintenan |
| m-05-terms-field-raw-db-value | DONE | 💰 |  | #2304 | .block-ready | [verified 2026-07-11] PR #2304 merged f869528c4; apps/frontend/src/lib/billTermsLabel.ts humanizes raw terms enum, prese |
| m-07-wo-dev-facing-footer-text | DONE | 💰 |  | #2304 | .block-ready | [verified 2026-07-11] PR #2304 merged f869528c4; CreateWorkOrderModal.tsx footer copy fixed, present on main |
| m-08-integration-strip-duplicates-topbar | DONE | 💰 |  | #2304 | .block-ready | [verified 2026-07-11] PR #2304 merged f869528c4; CreateWorkOrderModal.tsx integration-strip dedup, present on main |
| m-09-wo-table-filters-no-visual-indicator | DONE | 💰 |  | #2304 | .block-ready | [verified 2026-07-11] PR #2304 merged f869528c4; apps/frontend/src/pages/maintenance/components/WorkOrdersTable.tsx acti |
| M1-POSITIONED-PARTS | DONE |  |  | #913 | .block-ready | PR #913 merged 2026-06-12 |
| M2-INTEGRITY-POSITION-HISTORY | DONE |  |  | #915 | .block-ready | PR #915 merged 2026-06-13 |
| MANUAL-JE-CONTRACT | DONE | 💰 |  | #1919 | .block-ready | PR #1919 merged 2026-07-04 |
| MIGRATION-RUNNER-HARDEN | DONE |  |  | #914 | .block-ready | PR #914 merged 2026-06-13 |
| MNT-SHOP | DONE |  |  |  | program | all 3 named artifact(s) on main |
| modsweep-verify-local-ci-parity | DONE | 💰 |  |  | .block-ready | all 1 file(s) on main |
| MX-OPS | DONE |  |  |  | program | all 3 named artifact(s) on main |
| NOTIF-A | DONE |  |  | #1794 | .block-ready | [verified 2026-07-12] block own verify-*.mjs guard passes on main (built+wired) |
| OB1-NAV-HEADER-UNIFY | DONE |  |  | #894 | .block-ready | [verified 2026-07-12] block own verify-*.mjs guard passes on main (built+wired) |
| P0-BLOCK-3-DRIVER-LOAD-HISTORY | DONE |  |  | #731 | .block-ready | PR #731 merged 2026-06-08 |
| P1-BILL-GL-create-bill-auto-gl-post | DONE | 💰 |  | #2323 | .block-ready | PR #2323 merged 2026-07-11 |
| P1-BILLPAY-GL-bill-payment-auto-gl-post | DONE | 💰 |  | #2324 | .block-ready | PR #2324 merged 2026-07-11 |
| P2-BANK-AUTOMATCH-observable | DONE | 💰 |  | #2331 | .block-ready | PR #2331 merged 2026-07-11 |
| P2-BILLLINE-LOADID-bill-lines-load-id | DONE | 💰 |  | #2330 | .block-ready | PR #2330 merged 2026-07-11 |
| P3-INVOICE-FK-detention-invoice-fk | DONE | 💰 |  | #2332 | .block-ready | PR #2332 merged 2026-07-11 |
| P4-05-incidents-auto-claim-fk | DONE | 💰 |  | #2335 | .block-ready | PR #2335 merged 2026-07-11 |
| P4-06-work-order-entity-fks | DONE | 💰 |  | #2334 | .block-ready | PR #2334 merged 2026-07-11 |
| P4-CROSSMODULE-FKS-batch | DONE | 💰 |  | #2336 | .block-ready | PR #2336 merged 2026-07-11 |
| P5-T6-BANKING-TRANSFER | DONE |  |  | #862 | .block-ready | PR #862 merged 2026-06-10 |
| paritytable-a1-controlled-expansion | DONE | 💰 |  | #3069 | .block-ready | PR #3069 merged 2026-07-21 |
| paritytable-a2-group-bands | DONE | 💰 |  | #3074 | .block-ready | PR #3074 merged 2026-07-21 |
| paritytable-a3-controlled-pagination | DONE | 💰 |  | #3082 | .block-ready | PR #3082 merged 2026-07-21 |
| paritytable-a4-external-sort | DONE | 💰 |  | #3086 | .block-ready | PR #3086 merged 2026-07-21 |
| paritytable-a5-controlled-selection | DONE | 💰 |  | #3087 | .block-ready | PR #3087 merged 2026-07-21 |
| PERF-BUDGET-RAISE | DONE | 💰 |  | #1925 | .block-ready | PR #1925 merged 2026-07-04 |
| pre-push-env-isolation | DONE | 💰 |  | #2722 | .block-ready | PR #2722 merged 2026-07-19 |
| pre-push-pipeline-deadlock-3b0b | DONE | 💰 |  | #2709 | .block-ready | PR #2709 merged 2026-07-19 |
| PREREQ-A-SCHEMA-GRANT-GATE | DONE |  |  | #684 | .block-ready | all 1 file(s) on main |
| PREREQ-B-SETTLEMENT-DEDUCTION-SVC | DONE |  |  | #683 | .block-ready | PR #683 merged 2026-06-07 |
| PUSH-GATE-CLASSIFICATION-FRESHNESS | DONE | 💰 |  | #2689 | .block-ready | PR #2689 merged 2026-07-18 |
| Q9-TZ-timezone-library | DONE |  | T2 |  | program | all 1 named artifact(s) on main |
| qbo-ap-pull-dbflag-wire | DONE | 💰 |  | #2449 | .block-ready | all 4 file(s) on main |
| QBO-BANK-WRITEBACK-GATE-M7 | DONE | 💰 |  | #1916 | .block-ready | PR #1916 merged 2026-07-04 |
| qbo-parity-a1-accessorial-editor-paritytable | DONE | 💰 |  |  | .block-ready | all 3 file(s) on main |
| qbo-parity-a1-activity-log-paritytable | DONE | 💰 |  | #2858 | .block-ready | PR #2858 merged 2026-07-20 |
| qbo-parity-a1-asset-list-paritytable | DONE | 💰 |  | #2850 | .block-ready | PR #2850 merged 2026-07-20 |
| qbo-parity-a1-audit-log-viewer-paritytable | DONE | 💰 |  | #2888 | .block-ready | PR #2888 merged 2026-07-20 |
| qbo-parity-a1-audit-trail-paritytable | DONE | 💰 |  | #2898 | .block-ready | PR #2898 merged 2026-07-20 |
| qbo-parity-a1-catalog-table-paritytable | DONE | 💰 |  | #2906 | .block-ready | PR #2906 merged 2026-07-20 |
| qbo-parity-a1-compliance-table-paritytable | DONE | 💰 |  | #2848 | .block-ready | PR #2848 merged 2026-07-20 |
| qbo-parity-a1-driver-audit-history-paritytable | DONE | 💰 |  | #2863 | .block-ready | PR #2863 merged 2026-07-20 |
| qbo-parity-a1-driver-day-summary-paritytable | DONE | 💰 |  | #2881 | .block-ready | PR #2881 merged 2026-07-20 |
| qbo-parity-a1-driver-hub-reporting-paritytable | DONE | 💰 |  |  | .block-ready | all 3 file(s) on main |
| qbo-parity-a1-driver-import-modal-paritytable | DONE | 💰 |  |  | .block-ready | all 3 file(s) on main |
| qbo-parity-a1-driver-layover-history-paritytable | DONE | 💰 |  |  | .block-ready | all 3 file(s) on main |
| qbo-parity-a1-driver-score-detail-paritytable | DONE | 💰 |  |  | .block-ready | all 3 file(s) on main |
| qbo-parity-a1-driver-settlements-section-paritytable | DONE | 💰 |  |  | .block-ready | all 3 file(s) on main |
| qbo-parity-a1-drug-alcohol-program-paritytable | DONE | 💰 |  |  | .block-ready | all 3 file(s) on main |
| qbo-parity-a1-entity-audit-history-paritytable | DONE | 💰 |  | #2896 | .block-ready | PR #2896 merged 2026-07-20 |
| qbo-parity-a1-error-monitor-paritytable | DONE | 💰 |  | #2883 | .block-ready | PR #2883 merged 2026-07-20 |
| qbo-parity-a1-fleet-hos-board-paritytable | DONE | 💰 |  |  | .block-ready | all 4 file(s) on main |
| qbo-parity-a1-freetime-detention-paritytable | DONE | 💰 |  |  | .block-ready | all 3 file(s) on main |
| qbo-parity-a1-frequently-run-paritytable | DONE | 💰 |  | #2864 | .block-ready | PR #2864 merged 2026-07-20 |
| qbo-parity-a1-hos-tracker-paritytable | DONE | 💰 |  |  | .block-ready | all 3 file(s) on main |
| qbo-parity-a1-hos-viewer-paritytable | DONE | 💰 |  |  | .block-ready | all 3 file(s) on main |
| qbo-parity-a1-ifta-step-miles-paritytable | DONE | 💰 |  |  | .block-ready | all 3 file(s) on main |
| qbo-parity-a1-ifta-step-tax-paritytable | DONE | 💰 |  |  | .block-ready | all 3 file(s) on main |
| qbo-parity-a1-ifta-step1-mileage-paritytable | DONE | 💰 |  |  | .block-ready | all 3 file(s) on main |
| qbo-parity-a1-ifta-step2-fuel-paritytable | DONE | 💰 |  | #2917 | .block-ready | PR #2917 merged 2026-07-20 |
| qbo-parity-a1-labor-tracker-paritytable | DONE | 💰 |  | #2913 | .block-ready | PR #2913 merged 2026-07-20 |
| qbo-parity-a1-lane-detail-modal-paritytable | DONE | 💰 |  |  | .block-ready | all 3 file(s) on main |
| qbo-parity-a1-load-history-paritytable | DONE | 💰 |  | #2868 | .block-ready | PR #2868 merged 2026-07-20 |
| qbo-parity-a1-notification-log-paritytable | DONE | 💰 |  | #2860 | .block-ready | PR #2860 merged 2026-07-20 |
| qbo-parity-a1-notification-preferences-paritytable | DONE | 💰 |  |  | .block-ready | all 3 file(s) on main |
| qbo-parity-a1-notification-rules-paritytable | DONE | 💰 |  | #2859 | .block-ready | PR #2859 merged 2026-07-20 |
| qbo-parity-a1-ops-history-paritytable | DONE | 💰 |  | #2862 | .block-ready | PR #2862 merged 2026-07-20 |
| qbo-parity-a1-paritytable-universal-adoption | DONE | 💰 |  | #2843 | .block-ready | PR #2843 merged 2026-07-20 |
| qbo-parity-a1-position-history-paritytable | DONE | 💰 |  |  | .block-ready | all 3 file(s) on main |
| qbo-parity-a1-qbo-vendor-linkage-paritytable | DONE | 💰 |  | #2897 | .block-ready | PR #2897 merged 2026-07-20 |
| qbo-parity-a1-safety-events-table-paritytable | DONE | 💰 |  |  | .block-ready | all 4 file(s) on main |
| qbo-parity-a1-stop-reasoning-paritytable | DONE | 💰 |  | #2885 | .block-ready | PR #2885 merged 2026-07-20 |
| qbo-parity-a1-trailer-plates-paritytable | DONE | 💰 |  |  | .block-ready | all 3 file(s) on main |
| qbo-parity-a1-trailer-reefer-paritytable | DONE | 💰 |  | #2892 | .block-ready | PR #2892 merged 2026-07-20 |
| qbo-parity-a1-type-catalog-admin-paritytable | DONE | 💰 |  |  | .block-ready | all 3 file(s) on main |
| qbo-parity-a1-unit-driver-history-strip-paritytable | DONE | 💰 |  |  | .block-ready | all 3 file(s) on main |
| qbo-parity-a1-vehicle-compliance-paritytable | DONE | 💰 |  | #2880 | .block-ready | PR #2880 merged 2026-07-20 |
| qbo-parity-a1-vehicle-documents-paritytable | DONE | 💰 |  | #2879 | .block-ready | PR #2879 merged 2026-07-20 |
| qbo-parity-a1-vehicle-plates-paritytable | DONE | 💰 |  | #2865 | .block-ready | PR #2865 merged 2026-07-20 |
| qbo-parity-a1-vehicle-recent-activity-paritytable | DONE | 💰 |  | #2867 | .block-ready | PR #2867 merged 2026-07-20 |
| qbo-parity-a1-wo-time-tracking-paritytable | DONE | 💰 |  |  | .block-ready | all 3 file(s) on main |
| qbo-parity-name-plus-type-option-labels | DONE | 💰 |  | #2629 | .block-ready | PR #2629 merged 2026-07-17 |
| QBO-SYNC-DRIFT-401-FIX | DONE |  |  | #1535 | .block-ready | [verified 2026-07-12] QBOSyncDriftDashboard.tsx:39/47 use apiRequest (credentials:include) |
| QSTD-00 | DONE | 💰 |  | #1780 | .block-ready | PR #1780 merged 2026-07-02 |
| RECON-00 | DONE |  |  | #2216 | .block-ready | PR #2216 merged 2026-07-06 |
| RECON-02 | DONE |  |  | #1838 | .block-ready | all 2 file(s) on main |
| REGISTER-SOURCE-COL | DONE | 💰 |  | #1922 | .block-ready | PR #1922 merged 2026-07-04 |
| repair-b-driver-deduction-auth-template-not-se | DONE | 💰 |  | #2029 | .block-ready | [verified 2026-07-12] agent: gate live-wired via hire-contract codes (signed-finance-handoff.service.ts:224-238) |
| revenue-gl-linkage-db-isolation | DONE | 💰 |  | #2723 | .block-ready | PR #2723 merged 2026-07-19 |
| REVENUE-RECOGNITION-TWO-EVENT-LATCH-2026-07-19 | DONE |  |  | #2733 | .block-ready | PR #2733 merged 2026-07-19 |
| revert-pr2720-tracker-artifacts | DONE | 💰 |  | #2721 | .block-ready | PR #2721 merged 2026-07-19 |
| RPT-MODULE | DONE |  |  |  | program | all 3 named artifact(s) on main |
| RPT-PAR-1 | DONE |  |  |  | .block-ready | all 9 file(s) on main |
| rpt-par1-mgmt-report-test-and-drill | DONE | 💰 |  | #2712 | .block-ready | PR #2712 merged 2026-07-19 |
| s-01-coverage-gap-count-no-red-alert | DONE | 💰 |  | #2306 | .block-ready | [verified 2026-07-11] PR #2306 merged 107d5e09b (non-financial Safety visual sweep); apps/frontend/src/pages/safety/tabs |
| s-04-no-from-to-date-range-safety-lists | DONE | 💰 |  | #2835 | .block-ready | PR #2835 merged 2026-07-20 |
| s-06-log-event-no-time-field | DONE |  |  | #2630 | .block-ready | PR #2630 merged 2026-07-17 |
| s-08-no-driver-unit-type-date-filters-incident | DONE |  |  | #2815 | .block-ready | PR #2815 merged 2026-07-20 |
| SAFE-W3 | DONE |  |  |  | program | all 3 named artifact(s) on main |
| SAFE-W4 | DONE |  |  |  | program | all 3 named artifact(s) on main |
| SAFE-W5 | DONE |  |  |  | program | all 3 named artifact(s) on main |
| SETTLEMENTS-SIDEBAR-RENAME-MOVE | DONE |  |  | #893 | .block-ready | PR #893 merged 2026-06-12 |
| SHADOW-ROUTE-REDIRECTS | DONE |  |  | #887 | .block-ready | [verified 2026-07-12] block own verify-*.mjs guard passes on main (built+wired) |
| shared-catalog-creator-profile-debox | DONE | 💰 |  | #2697 | .block-ready | PR #2697 merged 2026-07-18 |
| SIDEBAR-DRIVER-HUB | DONE |  |  | #680 | .block-ready | PR #680 merged 2026-06-07 |
| SIDEBAR-INSURANCE | DONE |  |  | #717 | .block-ready | PR #717 merged 2026-06-08 |
| SKILL-LINKAGE-permanent-autoload | DONE | 💰 |  | #2322 | .block-ready | PR #2322 merged 2026-07-11 |
| SMOKE-TOKEN-AUTH | DONE |  |  | #860 | .block-ready | PR #860 merged 2026-06-10 |
| STMT-1-balance-sheet-cash-flow | DONE | 💰 | T2 |  | program | [verified 2026-07-03] balance-sheet + cash-flow routes live read-only |
| STRUCTURAL-MANIFEST-SPLIT | DONE |  |  | #650 | .block-ready | PR #650 merged 2026-06-07 |
| STRUCTURAL-MIGRATION-TIMESTAMPS | DONE |  |  | #648 | .block-ready | PR #648 merged 2026-06-07 |
| SWEEP-FIX-17-27 | DONE |  |  | #1798 | .block-ready | PR #1798 merged 2026-07-02 |
| systemic-pattern-column-drift-guard | DONE |  |  | #2839 | .block-ready | PR #2839 merged 2026-07-20 |
| systemic-pattern-mandatory-error-states-dispatch-alerts | DONE |  |  | #2846 | .block-ready | PR #2846 merged 2026-07-20 |
| TASKS-PLANNER-REDESIGN-V3 | DONE |  |  | #892 | .block-ready | PR #892 merged 2026-06-12 |
| TBL-STANDARD-INSURANCE-POLICIES | DONE |  |  | #1531 | .block-ready | [verified 2026-07-12] PoliciesList.tsx:12/172 migrated to shared DataTable |
| TBL-STANDARD-universal-table-sweep | DONE |  | T2 | #2296 | program | branch feat/tbl-standard-dispatch-load-table → PR #2296 merged 2026-07-08 |
| TEST-COPY-TO-ACCOUNTING-LINES-BILL-BRANCH | DONE | 💰 |  | #1009 | .block-ready | PR #1009 merged 2026-06-15 |
| TIER14-MEXICO-OPS | DONE |  |  | #804 | .block-ready | PR #804 merged 2026-06-08 |
| TIER15-MECHANIC-SHOP | DONE |  |  | #805 | .block-ready | PR #805 merged 2026-06-08 |
| TIER20-SECRETS-ROTATION | DONE |  |  | #806 | .block-ready | PR #806 merged 2026-06-08 |
| TIER21-DR-DRILL | DONE |  |  | #807 | .block-ready | PR #807 merged 2026-06-08 |
| TIER23-DEGRADATION | DONE |  |  | #808 | .block-ready | PR #808 merged 2026-06-08 |
| TIER26-PARTITION | DONE |  |  | #809 | .block-ready | PR #809 merged 2026-06-09 |
| TIER27-CANARY | DONE |  |  | #810 | .block-ready | PR #810 merged 2026-06-08 |
| TIER28-VENDOR-LOCKIN | DONE |  |  | #811 | .block-ready | PR #811 merged 2026-06-08 |
| TIER29-KNOWN-LIMITATIONS | DONE |  |  | #813 | .block-ready | PR #813 merged 2026-06-08 |
| TIER3-LIST-ERROR-STATES | DONE |  |  |  | .block-ready | [verified 2026-07-12] verify-list-error-state-coverage.mjs + verify-steps/112; guard PASS (20 list pages keep isError->L |
| type-date-input-sweep-incomplete | DONE | 💰 |  | #3310 | .block-ready | [verified 2026-07-12] agent: 0 raw type=date + verify-no-raw-date-input guard passes |
| UI-01_CALENDARS-AND-BOXES_DISPATCH | DONE | 💰 |  | #2337 | .block-ready | [verified 2026-07-11] dispatch twin of UI-01; PR #2337 merged 9baa803e0 (QB calendars + no-nested-box ratchet) on main |
| UI-01-CALENDARS-AND-FLAT-BOXES | DONE |  |  | #2337 | .block-ready | [verified 2026-07-11] PR #2337 merged 9baa803e0 — QuickBooks-format calendars everywhere + no-nested-box ratchet (2 guar |
| UI-02_QUICKBOOKS-PARITY-AND-WORKING-CREATE_DISPATCH | DONE | 💰 |  | #2339 | .block-ready | [verified 2026-07-11] dispatch twin of UI-02; PR #2339 merged 21bcc13c5 (create-forms-wired verify-first ratchet) on mai |
| UI-02-CREATE-FORMS-WIRED | DONE |  |  | #2339 | .block-ready | [verified 2026-07-11] PR #2339 merged 21bcc13c5; scripts/verify-create-forms-wired.mjs guard wired into locked-guards.ym |
| UI-03-PARTA-INLINE-CREATE | DONE |  |  | #2342 | .block-ready | [verified 2026-07-11] PR #2342 merged a1e520409 — inline '+ Create' vocab fix; scripts/verify-reference-dropdown-inline- |
| ui1-17-my-accountant-page | DONE | 💰 |  | #1547 | .block-ready | [verified 2026-07-11] apps/frontend/src/pages/accounting/MyAccountantPage.tsx present + routed at /accounting/my-account |
| UNIFIED-TXN-REGISTER | DONE |  |  | #1536 | .block-ready | [verified 2026-07-12] transaction-register.routes.ts present + autoloaded (index.ts:1011); FE lazy-mounted manifest.tsx: |
| USERS-1-PR-B | DONE | 💰 |  | #2281 | .block-ready | [verified 2026-07-12] merged PR #2281 |
| USERS-DEACTIVATE | DONE | 💰 |  | #1904 | .block-ready | PR #1904 merged 2026-07-04 |
| USMCA-MASTERDATA-IMPORT | DONE | 💰 |  | #1956 | .block-ready | PR #1956 merged 2026-07-04 |
| UX-A-table-alignment-DONE | DONE |  |  |  | program | all 1 named artifact(s) on main |
| UX-B-dispatch-location-column | DONE |  | T2 |  | program | all 1 named artifact(s) on main |
| UX-C-fleet-location | DONE |  | T2 |  | program | all 2 named artifact(s) on main |
| UX-D-hos-cycle-drawer | DONE |  | T2 |  | program | all 1 named artifact(s) on main |
| UX-E-compliance-hos-location | DONE |  | T2 |  | program | all 1 named artifact(s) on main |
| VENDOR-PROFILE-EDIT-BOX | DONE | 💰 |  | #1926 | .block-ready | PR #1926 merged 2026-07-04 |
| VISUAL-ACCOUNTING | DONE | 💰 |  | #1946 | .block-ready | PR #1946 merged 2026-07-04 |
| VISUAL-AUDIT-PUNCHLIST | DONE | 💰 |  | #1927 | .block-ready | PR #1927 merged 2026-07-04 |
| VISUAL-BANKING | DONE | 💰 |  | #1940 | .block-ready | PR #1940 merged 2026-07-04 |
| VISUAL-CASH-FLOW | DONE | 💰 |  | #1942 | .block-ready | PR #1942 merged 2026-07-04 |
| VISUAL-COMPLIANCE | DONE | 💰 |  | #1944 | .block-ready | PR #1944 merged 2026-07-04 |
| VISUAL-CUSTOMERS | DONE | 💰 |  | #1941 | .block-ready | PR #1941 merged 2026-07-04 |
| VISUAL-DISPATCH | DONE | 💰 |  | #1953 | .block-ready | PR #1953 merged 2026-07-04 |
| VISUAL-DOCS | DONE | 💰 |  | #1945 | .block-ready | PR #1945 merged 2026-07-04 |
| VISUAL-DRIVER-HUB | DONE | 💰 |  | #1935 | .block-ready | PR #1935 merged 2026-07-04 |
| VISUAL-DRIVERS | DONE | 💰 |  | #1936 | .block-ready | PR #1936 merged 2026-07-04 |
| VISUAL-ELD | DONE | 💰 |  | #1951 | .block-ready | PR #1951 merged 2026-07-04 |
| VISUAL-FACTORING | DONE | 💰 |  | #1930 | .block-ready | PR #1930 merged 2026-07-04 |
| VISUAL-FINANCE | DONE | 💰 |  | #1947 | .block-ready | PR #1947 merged 2026-07-04 |
| VISUAL-FLEET | DONE | 💰 |  | #1928 | .block-ready | PR #1928 merged 2026-07-04 |
| VISUAL-FORM-425 | DONE | 💰 |  | #1938 | .block-ready | PR #1938 merged 2026-07-04 |
| VISUAL-FUEL | DONE | 💰 |  | #1929 | .block-ready | PR #1929 merged 2026-07-04 |
| VISUAL-HOME | DONE | 💰 |  | #1949 | .block-ready | PR #1949 merged 2026-07-04 |
| VISUAL-INSURANCE | DONE | 💰 |  | #1939 | .block-ready | PR #1939 merged 2026-07-04 |
| VISUAL-INVENTORY | DONE | 💰 |  | #1943 | .block-ready | PR #1943 merged 2026-07-04 |
| VISUAL-LEGAL | DONE | 💰 |  | #1931 | .block-ready | PR #1931 merged 2026-07-04 |
| VISUAL-LISTS | DONE | 💰 |  | #1952 | .block-ready | PR #1952 merged 2026-07-04 |
| VISUAL-REPORTS | DONE | 💰 |  | #1937 | .block-ready | PR #1937 merged 2026-07-04 |
| VISUAL-SAFETY | DONE | 💰 |  | #1950 | .block-ready | PR #1950 merged 2026-07-04 |
| VISUAL-SETTLEMENTS | DONE | 💰 |  | #1933 | .block-ready | PR #1933 merged 2026-07-04 |
| VISUAL-TASKS | DONE | 💰 |  | #1934 | .block-ready | PR #1934 merged 2026-07-04 |
| VISUAL-USERS | DONE | 💰 |  | #1948 | .block-ready | PR #1948 merged 2026-07-04 |
| VISUAL-VENDORS | DONE | 💰 |  | #1932 | .block-ready | PR #1932 merged 2026-07-04 |
| W1-EVENT-LOG-SPINE | DONE | 💰 |  |  | .block-ready | all 1 file(s) on main |
| W1A-EVENT-LOG-IMMUTABLE | DONE | 💰 |  | #870 | .block-ready | PR #870 merged 2026-06-11 |
| W1B-TASKS-MODULE | DONE | 💰 |  | #872 | .block-ready | PR #872 merged 2026-06-11 |
| W2A-PROFITABILITY-ENGINE | DONE | 💰 |  | #871 | .block-ready | PR #871 merged 2026-06-11 |
| W2B-ALERT-RULES-PROFILES | DONE | 💰 |  | #873 | .block-ready | PR #873 merged 2026-06-11 |
| W2P-PLANNER-REDESIGN | DONE | 💰 |  | #874 | .block-ready | PR #874 merged 2026-06-11 |
| W3A-GEOFENCE-ENGINE | DONE | 💰 |  | #877 | .block-ready | PR #877 merged 2026-06-11 |
| W3B-FORCED-DRIVER-ACK | DONE | 💰 |  | #879 | .block-ready | PR #879 merged 2026-06-11 |
| W4A-SIGNED-SAFETY-DOCS | DONE | 💰 |  | #880 | .block-ready | PR #880 merged 2026-06-11 |
| W4B-BROKER-AUTO-UPDATE | DONE | 💰 |  | #881 | .block-ready | PR #881 merged 2026-06-11 |
| W5-TIME-UTILIZATION | DONE | 💰 |  | #883 | .block-ready | PR #883 merged 2026-06-11 |
| WORKORDER-branch-rebuild-linear-URGENT | DONE |  |  |  | program | all 1 named artifact(s) on main |
| 0007-pattern-1-unmounted-backend | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0007-pattern-2-column-drift-500s | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0007-pattern-5-split-brain-engines | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0007-pattern-9-fake-persist-evidence-loss | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0008-b-canonical-deduction-store | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0008-d-abandonment-pay-first-then-escr_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0008-g2-reporting-schema-canonical | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0008-g3-qbo-mirror-canonical_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0008-h-create-bill-line-items-load-id_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0010-f1-orphan-fk-columns_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0010-f15-plaid-amex-wf-error-status | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0010-f2-unscoped-financial-tables | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0010-f3-rls-missing-force | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0033-verify-fk-integrity-guard | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0091-b1-3-bill-unit-allocation-delete-not-void_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0091-c1-1-two-settlement-engines_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0091-d1-2 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0091-e1-4 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0091-flag-live-confirm-flag-state_DONE | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0091-g1-3 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0091-g10-h1 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0091-g10-h3 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0091-g11-2 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0091-g11-5 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0091-g7-1_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0091-g9-h1 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0091-g9-h4 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0091-g9-h5 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0091-h2-3 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0091-h5-1 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0091-info-b3-3 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0091-m-docs-2 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0091-m-driver-1 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0091-m-factor-1 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0091-m-home-2 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0091-m-lists-1 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0091-m-woid-1 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0219-nested-modals | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0242-no-auto-customer-charge-on-cancellation | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0242-no-auto-equipment-log-on-transfer | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0242-no-auto-escrow-deduction-driver-fault-can | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0243-b1-2-factor-reserve-default-liability-fal | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0243-b3-3-fuel-g18-trigger-hard-delete-gap | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0243-c1-1-orphaned-payroll-settlement-engine | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0243-c1-3-three-dead-end-buttons | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0243-c1-4-dead-duplicate-components-dispatchli | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0243-c2-4-bypass-driver-reads-pk-only | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0243-d1-2-vendors-split-two-tables_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0243-d1-3-inline-drawers-drop-captured-fields | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0243-e1-3-two-scheduled-report-engines | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0243-e1-4-driver-settlements-four-schemas | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0243-e1-6-bank-geo-schema-stranded | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0243-flag-live-all-9-gl-flags-on_DONE | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0243-g1-3-settlement-cash-advance-approvals-no | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0243-g10-c3-sentry-half-live-crons-pwa | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0243-g10-h1-load-stops-delete-grant-live | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0243-g10-h3-six-ui-features-404-routes | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0243-g10-m-seven-integrity-reliability-gaps | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0243-g11-10-month-close-checklist-unsatisfiabl | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0243-g11-2-two-deduction-subledgers-dont-recon | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0243-g11-5-period-close-no-reopen_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0243-g11-7-factoring-reserve-two-place_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0243-g2-2-operating-company-id-trusted-raw-ten | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0243-g4-deploy-smoke-fixed-unit-test-owner | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0243-g4-idem1-money-routes-off-allowli_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0243-g4-tx1-source-gl-two-transactions_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0243-g5-2-qbo-txn-inside-db-transaction | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0243-g6-2-vendor-create-no-dedup-guard | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0243-g6-3-customer-dedup-case-sensitive-unscop | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0243-g9-h1-settlement-double-pay-race | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0243-g9-h4-load-status-advisory-not-enforced | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0243-g9-m-eight-workflow-status-defects | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0243-h2-2-stale-backend-lockfile-unshipped-cve | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0243-h2-3-lucia-deprecated-auth-lib | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0243-h3-2-three-posting-flags-unprotected_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0243-h5-1-append-only-spine-unbounded-growth | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0243-h5-3-no-r2-evidence-check-dr-drill-stub-7 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0243-h6-1-qbo-refresh-token-race | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0243-h6-2-cash-advance-display-id-no-lock-no-u | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0243-h7-1-faro-rts-no-api_DESIGN | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0251-gap1-factoring-vendor-fk-not-stored | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0251-gap10-commodity-product-catalog | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0251-gap11-commodity-gl | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0251-gap12-commodity-equipment-mapping | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0251-gap13-commodity-rate-matrix | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0251-gap16-charge-code-catalog | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0251-gap17-charge-code-default-rates | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0251-gap2-vendor-gl-linkage | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0251-gap21-stop-location-catalog | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0251-gap22-lumper-expense_VERIFY | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0251-gap3-vendor-invoice-linkage | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0251-gap4-driver-vendor-mapping | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0251-gap5-chargecode-gl-mapping_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0251-gap7-fuel-surcharge-gl_VERIFY | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0251-gap8-accessorials-gl_VERIFY | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0251-gap9-charge-line-audit-trail | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0252-audit136-hr-policy-tracking | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0252-audit139-performance-management | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0252-audit141-benefits-administration | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0252-audit142-engagement-tracking | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0252-audit143-turnover-analysis | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0252-audit144-diversity-metrics | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0252-audit145-workplace-culture | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0252-audit146-workplace-safety-osha | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0252-audit147-wellness-program | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0252-audit148-remote-work-policy | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0252-audit150-employee-relations | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0257-audit-100 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0257-audit-76 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0257-audit-77 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0257-audit-87 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0257-audit-88 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0258-audit-112 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0270-no-auto-driver-termination-walkoff-noshow | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0270-no-auto-equipment-log-update-duplicate | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0275-audit173-data-privacy-compliance | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0277-any-type-reports-library-routes | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0277-csrf-tokens-recommendation | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0277-error-swallowing-rollback-catch | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0278-eld-none-identified-contradiction | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0278-safety-gap1-auto-driver-status | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0278-safety-gap3-auto-notifications | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0280-03-open-loads-driver-unit-linkage | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0280-04-cash-position-reconciliation-linkage | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0280-12-message-queue-driver-customer-linkage | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0280-18-driver-kpi-profile-linkage | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0280-19-attention-items-driver-settlement-link | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0280-20-cooling-drivers-last-load-linkage | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0280-27-widget-audit-trail-logging | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0280-28-api-response-zod-validation | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0280-29-legacy-fallback-tests | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0280-32-revenue-to-customer-linkage | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0280-42-wo-to-expense-flow | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0285-acct-gap2-no-auto-invoice-send | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0285-banking-transfer-gl-gap_VERIFY | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0285-df-gap1-no-escrow-for-cash-advances | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0285-df-gap2-dual-deduction-systems | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0394-qbo-sync-one-shot-not-recurring | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0394-qbo-transaction-pull-missing_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod10-autodeductionpolicies-fully-dead | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod10-cashflow-accounting-routes-dead | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod10-cashflow-income-loadid-plaintext | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod10-deductions-never-reduce-settlement | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod10-finalize-5s-staleness-race | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod10-holddeduction-id-mismatch_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod10-three-settlement-dispute-backends | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod11-deduction-trail-period-close-zero-r | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod11-dispatch-margin-cash-500 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod11-financial-change-log-starved | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod11-fuel-recon-zero-and-noop-save-link | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod11-geofence-recon-green-on-failed-fetc | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod11-ifta-drift-two-preparers | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod11-owner-mint-maker-checker | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod11-profit-per-truck-cron-double-count | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod11-three-parallel-scheduled-report-sys | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod11-users-changerole-no-approver-ui | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod12-docs-lowest-uuid-company-bug-live | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod12-eld-module-fake-stub | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod12-legal-no-reverse-drill-through | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod13-coa-merge-no-gl-repoint_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod13-compliance-tabs-local-usestate-not- | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod13-form425c-exhibit-c-opening-balance- | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod13-inventory-accounting-none_DESIGN | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod13-inventory-part-to-vendor-none | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod13-inventory-purchases-not-built | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod13-lists-driver-vs-drivers-parallel-tr | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod13-load-cancellation-reasons-split-bra | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod13-notifications-module-not-fully-audi | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod2-csv-import-mileage-phantom | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod2-vendor-ap-disconnected | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod2-wo-split-brain | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod3-fuel-compliance-not-available-rows | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod3-fuel-expensive-states-free-text | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod3-fuel-loves-prices-isolated | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod4-dispatch-cancel-bypasses-approval-ga | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod4-dispatch-cancellation-reasons-decoy- | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod4-dispatch-detention-in-shop-hardcoded | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod4-dispatch-mapview-no-real-map | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod4-dispatch-settings-localstorage-only | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod5-actionbar-dead-links | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod5-addtraining-drops-expiry | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod5-auto-deductions-team-splits-dead | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod5-border-creds-no-edit | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod5-disputes-no-approve-deny-dual-check | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod5-dqf-panel-free-text-no-fk | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod5-onboarding-step-data-only | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod5-retention-excludes-critical-truncate | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod5-settlements-card-deprecated-table | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod5-teams-tab-unreachable | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod6-accident-edit-500-status-silent-fail | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod6-damage-insurance-worker-unregistered | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod6-hos-create-violation-mislabeled-link | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod6-hos-exceptions-archived-stub | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod6-hos-violations-source-enum-mismatch | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod6-hos-violations-void-hardcoded-reason | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod6-idvr-row-not-clickable-session-fake- | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod6-spawn-liability-fake-stub | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod7-bill-subnav-filters-not-creators_UI | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod7-escrow-read-only | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod7-invoices-plaintext-audit-log_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod7-je-rows-no-onclick_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod7-myaccountant-flag-no-seed | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod8-auto-match-button-dead | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod8-factoring-virtual-hardcodes-zero | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod8-plaid-sign-deposits-negative | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod9-create-trailer-no-manual-path | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod9-customer-taxonomy-mismatch | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod9-customers-list-12-tabs-9-stubs | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod9-fleet-insurance-summary-never-render | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod9-fleet-roster-no-create-actions | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod9-four-disjoint-vendor-tables | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod9-maintenance-vendor-linkage-broken | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod9-merge-vendors-no-gl-repoint_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod9-mileage-dropped-on-create-edit | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod9-quality-history-cant-attach-load-inv | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod9-second-create-unit-backend-orphaned | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0441-mod9-vendor-contact-fields-notes-blob | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0451-fin2-finance-lands-on-stub-not-hub | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0473-1-1-default-revenue-account-unmapped-line | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0473-1-10-year-end-close-retained-earnings-asc | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0473-1-6-wo-void-reversal-grain | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0473-1-8-tk-transp-lease-asc842 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0473-1-9-driver-settlement-net-pay-mod_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0473-2-4-ap-aging-partial-mismatch_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0473-2-5-trial-balance-002-cosmetic_CLEANUP | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0473-2-7-bank-transactions-uncategorized-plaid | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0490-critical-g11-1-deduction-consent-template | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0490-critical-users3-owner-mint-approval-path | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0490-new3-c2-1-detectitemsdrift-scoping | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0490-section-c-2-reporting-vs-reports-drift | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0490-structural-fix-liability-deduction-fk-spi | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0518-r09-plaid-amex-wf-error | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0518-r10-qbo-sync-workers-off-mirror-stale | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0518-r15-a11y-12-critical-234-serious | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0518-r17-147-fk-less-financial-columns | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0518-r18-schema-fragmentation-8-dup-pairs | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0518-r23-ifta-q2-deadline | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0519-at1-245-tables-missing-created-by-user-id | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0519-at2-no-db-enforced-sod | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0519-bk1-plaid-amex-wf-error | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0519-co2-unassigned-drivers-hos-gap | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0519-dc2-maint-schema-144-rows-active-alongsid | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0519-dq1-driver-dummy-test-record-in-prod | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0519-dq2-driver-placeholder-phone | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0519-dq3-driver-blank-cdl | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0519-dq4-fleet-blank-vin-make-model | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0519-es1-58-unscoped-tables | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0519-fl1-2649-bank-tx-uncategorized_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0519-lg1-5-nullable-financial-columns_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0519-ma1-0-pm-schedules-for-122-vehicles | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0519-mig2-4-applied-migrations-no-file-on-disk | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0519-ri1-689-orphan-fk-columns | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0519-sf1-82-drivers-0-settlements | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| a-03-expenses-fullpage-form-not-list-drawer | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| a-05-bills-no-page-level-create-button | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| AF-5-stub-catalogs | AUDIT-NOTE | 💰 | T2 |  | program | [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — stale 34-stub estimate; expense categor |
| audit-spine-a1-a9-emit-coverage-task | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| audit10-payroll-automation-tax-withhol_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| audit19-ma-due-diligence-framework | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| audit4-tax-return-automation | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| audit5-fraud-anomaly-detection | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| audit7-cost-center-tracking | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| audit8-revenue-leakage-detection | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| banking-2-plaid-connections-error-state | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| banking-b4-driver-vendor-account-mapping | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| banking-grid-sort-resize-rows-per-page | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| bf1-driver-fault-liability-deduction | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| bf10b-qbo-recon-six-types | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| bf10c-driver-conduct-catalogs-scorecard | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| bf2-walkoff-termination-trigger | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| bf4-load-invoice-ar-factoring-payment | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| bf7-cash-advance-recovery-engine | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| bf9a-accident-claim-liability-deduction | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| bf9b-wo-cost-unit-load-allocation-gl_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| biz-flow-1-abandonment-separate-from-terminati | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| biz-flow-1-escrow-not-linked-to-termination | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| biz-flow-1-termination-not-linked-to-load | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| biz-flow-3-no-auto-escrow-deduction-driver-fau | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| biz-flow-3-no-cancellation-deduction-linkage | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| biz-flow-6-no-automatic-invoice-sending | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| biz-flow-6-payment-application-manual_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| biz-flow-7-no-automatic-team-assignment | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| biz-flow-8-no-equipment-log-auto-update | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| biz-flow-9-no-automatic-driver-status-update-s | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| biz-flow-9-no-automatic-escrow-deduction-safet | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| bl-04-no-rate-con-pdf-generation | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| BLOCKS-NEW-DECISIONS | AUDIT-NOTE |  |  |  | program | [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — process/dispatch helper (OWNER-DECISION |
| C1-PICKER-LAW-replace-every-raw-UUID-input-with-the-canonica | AUDIT-NOTE |  |  |  | program | [verified 2026-08-02] EVAPORATE H5-EMPTY-WAVE per 08-BLOCK-BACKLOG-COUNT-CORRECTED-2026-08-01.md — 23 catalog-backed pic |
| ci1-build-typecheck-flake-root-cause-and-guard | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| coder-32-migration-drift-prod-triage-pending | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| coder-work-order-t1-7-escrow-ui-zero-callers | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| coder-work-order-t2-6-accident-liability-stub | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| core-ledger-write-proof-trucking-evidence | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| cust1-vend1-pager-total-count-bug | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| custvend-par1-g3-customer-statement-en_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| custvend-par1-vendor-credits-no-ui | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| d-01-new-load-overview-http-400 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| d-04-settlements-board-redirect-notice | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| daily-tms-qbo-reconciliation-cadence | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| db5-resize-removal-directive-vs-current-lock | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| dh-01-driver-hub-overview-stub | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| dip-mor-pre-post-petition-ap-split | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| dispatch-board-db2-db7-fixes | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| dispatch-sweep-gap-11 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| dispatch-sweep-gap-15 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| dispatch-sweep-gap-21 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| dispatch-sweep-gap-22 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| dp-03-cdl-expires-blank | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| dp-04-hire-date-blank | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| driver-d-cluster-scope-guard-missing | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| entitylink-reverse-drill-incomplete | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| events-event-log-force-rls-still-blocked | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| expand-escrow-non-bond-deductions | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| expenses-list-routing-bug | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| fact-par-1-factoring-submission-gating | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| fact-par-1-submission-workflow | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| factoring-asc860-cpa-control-test-open | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| factoring-asc860-determination-memo | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| factoring-coder-directive-item-c-unconfirmed | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| factoring-g3-debtor-credit-check-decision-note | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| fh-unit-allocation-ui-view-missing | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| fk-cancellation-deductions-0289 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| fk-equipment-transfer-log-0289 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| fk-escrow-termination-0289 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| fk-termination-load-0289 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| fl-01-vin-make-model-year-blank | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| fl-02-location-blank-despite-samsara | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| fl-03-dot-oo-dates-blank | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| fleet-2-trailer-master-data-sparse | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| flow1-auto-termination-walkoff-noshow | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| flow1-escrow-linked-to-termination-record | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| flow1-termination-load-escrow-linkage | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| flow3-cancellation-auto-customer-charge | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| flow3-cancellation-auto-escrow-deduction | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| flow3-cancellation-billing-deduction-linkage | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| flow5-dual-deduction-systems-consolidate | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| flow7-auto-team-assignment | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| flow8-equipment-transfer-notifications | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| flow8-no-auto-equipment-log-notify | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| flow9-safety-event-auto-escrow-deduction | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| flow9-safety-event-auto-notifications | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| flow9-safety-event-no-auto-status-escrow-notif | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| FOR-CURSOR-2-README-ACCOUNTING-BANKING | AUDIT-NOTE |  |  |  | program | [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — process/dispatch helper (class-sweep re |
| gated-blocks-conn-plaid-relay-edi | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| global-column-resize-sort-parity-table-phase-a | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| h-03-open-queue-navy-cta | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| h-04-kpi-sublabel-contrast | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| help-module-minimal-vs-meets | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| hiredate-provenance-partial | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| hiring-bypass-and-safety-contract-alerts | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| home6-fleet-rls-opco-context-unverified | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| ifta-sales-tax-booking-location-confirm | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| import-1v2-trk-full-coa-equity | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| import-4v2-gl-detail-hardened | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| law-of-land-entitylink-reverse-drill-adoption | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| ledger-write-proof-operational-not-found | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| linkage-safety-event-no-driver-status-update | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| linkage-walkoff-no-auto-termination | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| load-cancellations-fk-per-entity-repoi_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| module-catalog-26-modules-unfinished-sweep | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| module25-required-docs-ruleset-per-entity | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| notif-b-android-block | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| owner-batch-s2-units-value-catalog | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| p1-apm | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| p1-caching-strategy | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| p1-compression | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| p1-data-encryption-at-rest | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| p1-error-handling | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| p1-logging-system | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| p1-session-timeout | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| p1-vulnerability-management | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| P4-01_SAFETY-INSURANCE-LINK_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| P4-02_LEGAL-LINK_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| P4-03_UNIT-IDENTITY_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| P4-04_SAFETY-COST-GL_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| P4-05_DAMAGE-CLAIM-FK_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| P4-06_WO-FK_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| P4-07_PARTS-GL_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| P4-08_WO-DOUBLE-BILL_VERIFY | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| PASTE-TO-CLAUDE-CODER | AUDIT-NOTE |  |  |  | program | [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — process/dispatch helper (class-sweep pa |
| PASTE-TO-CURSOR | AUDIT-NOTE |  |  |  | program | [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — process/dispatch helper (class-sweep pa |
| PHASE0_DEPLOY-DRIFT_prod-older-than-main_VERIFY | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| phase12-audit210-energy | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| phase13-audit220-manufacturing-duplicate | AUDIT-NOTE | 💰 |  | #2385 | .block-ready | [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — generic industry audit block, no IH35 s |
| phase13-audit228-energy-duplicate | AUDIT-NOTE | 💰 |  | #2385 | .block-ready | [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — generic industry audit block, no IH35 s |
| phase14-audit-241 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| PHASE2_ACCESSORIAL-REVENUE_divergent-engine_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| PHASE2_CANCEL-TONU_billable-cancellation-no-charge_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| PHASE2_LOAD-INVOICE_no-auto-ar_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| PHASE2_RECON-COLLECTOR_frozen-feed_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| phase8-audit161-api-audit | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| public-audit-log-partitions-no-rls | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| qbo-parity-resizable-columns-everywhere | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| qbo-realtime-webhook-sync | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| repair-e-escrow-return-and-tieouts-des_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| ruling-3-driver-escrow-current-vs-long_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| ruling-4-embezzlement-reclass-off-ar-q_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| s-02-insurance-sidebar-not-standalone | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| s-10-no-type-filter-incidents | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| s-12-log-event-button-navy-cta | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| safety-dot-fields-and-driver-create-fix | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| safety2-cert-expiry-nav-distinct-route | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| settlement-posting-design-doc-missing_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| sweep-fix-17-27-fixture-names-and-pager | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| sweep-g11-1-deduction-consent-template_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| sweepfix1727-8 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| systemic-pattern-mandatory-error-states | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| systemic-pattern-never-toast-success-posted-fa | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| systemic-pattern-r2-verify-bytes-guard | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| tbl-standard-raw-table-sweep-incomplete | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| threewayaudit-biz02-qbo-sync-workers-stale | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| users-invited-status-distinct-from-active | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| usmca-banking-ingestion-dedup | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| usmca-unhide-entity-switcher | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| vend1-pagination-total-vs-length | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| vend3-test-vendor-rows-visible | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| vend4-dual-qbo-sync-single-source-of-truth-dec | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| VISUAL-REMAINDER-LAYOUT | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| wo-cancellation-reasons-fold-into-void-cancel- | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| year-end-close-retained-earnings-asc852-freshs | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
