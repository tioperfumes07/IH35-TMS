# BLOCK RECONCILIATION — 2026-08-10 (every block, built vs pending — verified)

**DONE** = verified on main (branch merged or all signature files present).  **NEEDS-VERIFY** = weak signal (title-match / partial files / self-report), not trusted until GUARD confirms.  **PENDING** = needs build.  **PENDING (GATED)** = financial/locked, needs Jorge's gate first.

**Verified against `origin/main` (13844 files) + 3000 merged PRs.** A block is **DONE only if its branch merged OR all its signature files are present on main** — those are the only evidence. Weak signals (PR-title token match, partial files, a doc's own "shipped/done" self-report, a prior hardcoded built-claim) are **NEEDS-VERIFY** — not trusted until GUARD confirms. Nothing reads as DONE that wasn't really verified.

## Counts
- **PENDING**: 15
- **PENDING (GATED)**: 29
- **NEEDS-VERIFY**: 63
- **DONE**: 552
- **AUDIT-NOTE**: 548

## Universe — why 1207 blocks (the "456 vs 294 .block-ready" gap, explained)
The reconciler spans **5 sources**, de-duped by **unique block_id** and **excluding retired duplicates** — the block count is the union, **not** the raw `.block-ready` file count.
- Total = union of 5 sources (.block-ready, docs/blocks program, docs/accounting, docs/dispatch enterprise-29, docs/specs gap), de-duped by UNIQUE block_id, EXCLUDING files with EXPLICIT retirement markers (_DUP/_STALE/_SUPERSEDED underscore suffixes, status superseded/duplicate/dup/stale, or superseded_by/duplicate_of). Hyphen descriptive …-stale/…-duplicate live defect IDs are NOT retired by filename alone. So the block count is neither the raw .block-ready file count nor inflated by duplicate/retired registrations.
- **`.block-ready/*.json` files on disk:** 1382 (of which **367 retired** dup/stale/superseded are excluded → **1015 active**)
- **By source (after de-dup):** .block-ready: 1010 · program: 86 · enterprise-29: 29 · accounting: 25 · gap-spec: 57

## Delta — blocks added since 2026-06-16 (today's work, now counted)
Blocks whose `.block-ready` file carries `"added" >= 2026-06-16`. If empty, no new blocks were registered.
| Block | Status | PR | Title |
|-------|--------|----|-------|
| BANK-18-DESIGNVIEW-QBO-PARITY | DONE | #3131 |  |
| BANK-18-KEYSTONE-CATEGORIZE-REGISTER | DONE | #3131 |  |
| DOC-15-QBO-TOKEN-AUTOREFRESH | NEEDS-VERIFY |  |  |
| DOC-16-RECON-INPROCESS-SCHEDULER | NEEDS-VERIFY | #2367 |  |
| DOC-17-DEFINITION-OF-DONE | DONE | #2370 |  |
| DOC-CATALOGS-ACCOUNTS-FK-INVENTORY | AUDIT-NOTE |  | Authoritative FK re-key inventory for catalogs.accounts (29 cols/20 tables) — AF-1 input. |
| DOC-CATALOGS-CLASSES-FK-INVENTORY | AUDIT-NOTE |  | catalogs.classes per-entity FK inventory — companion to AF-1. |
| FIX-19B-EXPENSES-CATEGORY-INLINE-CREATE | DONE |  |  |
| FIX-DISPATCH-DRIVER-PICKER-50-CAP | DONE |  | Book Load driver picker 50-cap — load full active set (limit:200) so drivers past newest 50 appear (Mecor). Also #1529 i |
| FIX-DRIVERS-FULL-NAME-PHANTOM | DONE |  | mdata.drivers.full_name phantom across 5 endpoints (42703) → CONCAT_WS(first,last); +db-test guard. |
| FIX-LEGAL-FLEET-VEHICLE-TYPE-PHANTOM | DONE |  | Legal lease-to-own /fleet 500 — phantom u.unit_type → vehicle_type. |
| FIX-MAINTENANCE-SERVICES-ETA-PHANTOM | DONE |  | services/eta 500 — 3 phantom mdata.units cols → telematics.vehicle_latest_position + maintenance.pm_schedules. |
| FIX-PER-TRUCK-CPM-PERMITS-CTE | DONE |  | per-truck-cpm permits CTE 500 fix — repoint phantom CTE to the real unit relation; +static CI guard. |
| FIX-PICKERS-50-CAP-UNITS-VENDORS-CUSTOMERS | DONE |  | 50-cap class — unit/vendor/customer client pickers load full active set (limit forwarded in mdata.ts). |
| IMPORT-0 | DONE |  | IMPORT-0 QBO Reports API client (TrialBalance + GeneralLedger, v2 response shape) + exact-cents parsers + monthly date c |
| IMPORT-P0 | DONE | #1797 | IMPORT-P0 JE→QBO push kill-switch + masterdata echo guard. HARD PREREQUISITE: no import run (opening balance or GL detai |
| IMPORT-P0b | DONE | #1802 | IMPORT-P0b — entity-push kill-switch: gate every TMS→QBO write of invoice/bill/customer/vendor/account/item so nothing r |
| ITEM-02-EXCEL-UPLOAD-RLS-REASSERT | PENDING (GATED) | #2369 |  |
| ITEM-13-CEREMONY-VALIDATE-FKS | DONE | #2368 |  |
| ITEM-14-TXN-COMPANY-ISOLATION-GUARD | DONE | #2363 |  |
| QBO-SYNC-DRIFT-401-FIX | DONE |  | QBO Sync Drift dashboard 401 — data calls send session cookie via apiRequest (was raw fetch). |
| RECON-00 | NEEDS-VERIFY | #2300 | RECON-00 Design lock: commit the TMS↔QBO Reconciliation Module architecture spec (double-books/no-sync, twice-daily pass |
| RECON-01 | NEEDS-VERIFY |  | RECON-01 Schema + scheduled jobs + exception engine: additive CREATE TABLE accounting.recon_runs + accounting.recon_exce |
| RECON-02 | DONE |  | RECON-02 UI tabs: extend the FIN-23 surface at /accounting/qbo-reconcile with Runs + Exceptions tabs (ParityTable gramma |
| SWEEP-FIX-17-27 | DONE |  | Consolidated fixes for the modules 17-27 sweep defects. PR A ships the code fixes with regression tests; PR B (owner-gat |
| TBL-STANDARD-INSURANCE-POLICIES | DONE |  | TBL-STANDARD surface 1 — migrate Insurance Policies list to the shared DataTable. |
| UNIFIED-TXN-REGISTER | DONE |  | Unified Transaction Register — bank+fuel+AR+AP+settlement in one read-only entity-scoped register. |
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
| chain-08-demo-data-purge | PENDING | 💰 |  |  | .block-ready | [verified 2026-07-12] agent: audit lists only, purge Pass2 never ran (CHAIN-08-TRANSP-DEMO-DATA-AUDIT) |
| CHAIN-08-transp-demo-data-purge | PENDING | 💰 | T1 | #2221 | program | [verified 2026-07-12] agent: same PR #2221 explicitly no-purge per file header |
| CLOSURE-25-RUNBOOKS | PENDING |  |  |  | .block-ready | 0/1 signature file(s) on main |
| driverprofile-1-companion-tier1-rls-hardening | PENDING | 💰 |  | #1742 | .block-ready | [verified 2026-07-12] agent: PR #1742 frontend test/UI only, zero RLS/backend touched |
| fk-safety-events-driver-status-0289 | PENDING | 💰 |  | #5017 | .block-ready | [verified 2026-07-12] agent: migration validates unrelated FKs, no safety_events/driver_status FK exists |
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
| FEAT-SETTLEMENT-RECOVERY-GL-JE | PENDING (GATED) | 💰 |  |  | .block-ready | 0/1 signature file(s) on main |
| FH-VERIFY-finance-hub-modules | PENDING (GATED) | 💰 | T1 |  | program | forward spec — 0 named artifacts on main |
| FIX-05-BANKING-SPLIT-ENABLE-AND-WIRE | PENDING (GATED) | 💰 |  |  | .block-ready | [verified 2026-07-11] owner-verified: split modal built but button disabled Wave-2 + flag OFF; wire+dedupe pending, flag |
| HOS-FANOUT-03-08 | PENDING (GATED) |  | T2 |  | program | GATED / VERIFY-STATE. Tier 2. |
| HOS-MAP-driver-samsara-id | PENDING (GATED) |  | T2 |  | program | LIVE-TRACED / BUILD. Tier 2 (telematics) + MIGRATE if a backfill writes ids. STOPS for Jor |
| HOS-PRC-DATA-verbatim-clocks | PENDING (GATED) |  | T2 |  | program | LIVE-TRACED / GATED. Tier 2 (telematics, no money). |
| HOS-PRC2-reader-swap | PENDING (GATED) |  | T2 |  | program | GATED on GUARD per-driver verify (board == roster == Samsara certified ELD). Tier 2. |
| ITEM-02-EXCEL-UPLOAD-RLS-REASSERT | PENDING (GATED) | 💰 |  | #2369 | .block-ready | [verified 2026-07-11] HELD PR #2369; owner approves + runs as neondb_owner |
| STMT-2-opening-balances | PENDING (GATED) | 💰 | T1 |  | program | forward spec — 0 named artifacts on main |
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
| a-03-expenses-fullpage-form-not-list-drawer | NEEDS-VERIFY | 💰 |  | #5170 | .block-ready | PR #5170 title-match only, unverified |
| a-05-bills-no-page-level-create-button | NEEDS-VERIFY | 💰 |  | #5172 | .block-ready | PR #5172 title-match only, unverified |
| audit-spine-a1-a9-emit-coverage-task | NEEDS-VERIFY | 💰 |  | #4374 | .block-ready | PR #4374 title-match only, unverified |
| audit2-internal-controls-approval-workflow | NEEDS-VERIFY | 💰 |  | #3153 | .block-ready | PR #3153 title-match only, unverified |
| audit9-expense-validation-duplicate-detection | NEEDS-VERIFY | 💰 |  | #3143 | .block-ready | PR #3143 title-match only, unverified |
| BLOCK-02-DRIVER-ESCROW-DESIGN | NEEDS-VERIFY | 💰 |  | #2905 | .block-ready | [verified 2026-07-20] NOT A VERDICT — anti-fake-green downgrade. Registering this block pointed allowed_files at canonic |
| block-22-driver-settlement-engine | NEEDS-VERIFY | 💰 |  | #2905 | .block-ready | [verified 2026-07-20] NOT A VERDICT — anti-fake-green downgrade. Same cause: all signature files present on main auto-pr |
| BLOCK-C-DEDUCTION-CAP | NEEDS-VERIFY |  |  |  | .block-ready | 2/3 signature file(s) on main — partial, unverified |
| BLOCK-C-MIGRATION-RENAME | NEEDS-VERIFY |  |  |  | .block-ready | 1/2 signature file(s) on main — partial, unverified |
| BLOCK-F-INSURANCE-CANCELLATION | NEEDS-VERIFY |  |  |  | .block-ready | 9/10 signature file(s) on main — partial, unverified |
| BLOCKS-FUEL | NEEDS-VERIFY |  |  |  | program | partial 4/5 artifact(s) on main — unverified |
| C10-ROUTES-every-defined-route-is-mounted-no-404-route-manif | NEEDS-VERIFY |  |  | #3570 | program | PR #3570 title-match only, unverified |
| C11-SPLIT-BRAIN-single-canonical-table-per-entity-STOP-class | NEEDS-VERIFY |  |  | #3698 | program | PR #3698 title-match only, unverified |
| C7-ACCT-SUBNAV-CHROME | NEEDS-VERIFY | 💰 |  |  | .block-ready | 9/10 signature file(s) on main — partial, unverified |
| CHAIN-04-bill-payment-tieout | NEEDS-VERIFY | 💰 | T1 |  | program | [verified 2026-07-12] code-guard passes + reuses the CHAIN-05-proven posting engine, but 0 open bills on TRANSP to exerc |
| CLOSURE-10-MAINT-PARTS-CATALOG | NEEDS-VERIFY |  |  |  | .block-ready | 5/6 signature file(s) on main — partial, unverified |
| CLOSURE-11-MAINT-SERVICES-CATALOG | NEEDS-VERIFY |  |  |  | .block-ready | 5/6 signature file(s) on main — partial, unverified |
| CONN-1-plaid-reconcile-commit | NEEDS-VERIFY | 💰 | T1 |  | program | [verified 2026-07-12] code-guard passes + reuses the CHAIN-05-proven posting engine, but 0 reconciliation sessions on TR |
| CONN-3-relay-internal-bank | NEEDS-VERIFY | 💰 | T1 | #4394 | program | PR #4394 title-match only, unverified |
| consolidate-distributed-modules-fuel-tasks-fin | NEEDS-VERIFY | 💰 |  | #3276 | .block-ready | [verified 2026-07-12] agent: PR #2135 docs-only, no code/migration touched |
| d-02-cancel-load-shown-on-unsaved-load | NEEDS-VERIFY | 💰 |  | #2778 | .block-ready | PR #2778 title-match only, unverified |
| db249-finance-schema-naming-drift | NEEDS-VERIFY | 💰 |  | #3852 | .block-ready | PR #3852 title-match only, unverified |
| db249-index-optimization-3 | NEEDS-VERIFY | 💰 |  | #3852 | .block-ready | PR #3852 title-match only, unverified |
| DISP-DRAWER-WIRE | NEEDS-VERIFY |  |  |  | .block-ready | 9/12 signature file(s) on main — partial, unverified |
| DISP-FINES-DEDUCT | NEEDS-VERIFY |  |  |  | .block-ready | 1/2 signature file(s) on main — partial, unverified |
| DOC-15-QBO-TOKEN-AUTOREFRESH | NEEDS-VERIFY | 💰 |  |  | .block-ready | [verified 2026-07-11] merged #2366; awaiting post-deploy hourly-tick refresh proof |
| DOC-16-RECON-INPROCESS-SCHEDULER | NEEDS-VERIFY | 💰 |  | #2367 | .block-ready | [verified 2026-07-11] PR #2367; awaiting first accounting.recon_runs row |
| f-01-fuel-home-stub | NEEDS-VERIFY | 💰 |  | #4635 | .block-ready | PR #4635 title-match only, unverified |
| f-02-jump-to-tab-nonstandard | NEEDS-VERIFY | 💰 |  | #4656 | .block-ready | PR #4656 title-match only, unverified |
| FEAT-DISP-DRAWER-WIRE | NEEDS-VERIFY |  |  |  | .block-ready | 9/12 signature file(s) on main — partial, unverified |
| FEAT-SETTLEMENT-RECOVERY-CAPPED-WIRING | NEEDS-VERIFY | 💰 |  |  | .block-ready | 1/2 signature file(s) on main — partial, unverified |
| flow2-auto-deduction-trigger-from-customer-exp | NEEDS-VERIFY | 💰 |  | #3159 | .block-ready | PR #3159 title-match only, unverified |
| flow2-customer-chargeback-driver-expense | NEEDS-VERIFY | 💰 |  | #3159 | .block-ready | PR #3159 title-match only, unverified |
| flow6-auto-invoice-sending | NEEDS-VERIFY | 💰 |  | #3140 | .block-ready | PR #3140 title-match only, unverified |
| flow6-auto-payment-application | NEEDS-VERIFY | 💰 |  | #3140 | .block-ready | PR #3140 title-match only, unverified |
| GAP-47 | NEEDS-VERIFY |  |  |  | .block-ready | 3/5 signature file(s) on main — partial, unverified |
| GAP-86-POLICY-WIZARD | NEEDS-VERIFY |  |  |  | .block-ready | 27/29 signature file(s) on main — partial, unverified |
| GAP-IDEMP-KEYS | NEEDS-VERIFY |  |  |  | .block-ready | 29/31 signature file(s) on main — partial, unverified |
| h-01-entity-badge-conflict | NEEDS-VERIFY | 💰 |  | #2677 | .block-ready | PR #2677 title-match only, unverified |
| h-05-home-kpi-no-date-range-toggle | NEEDS-VERIFY | 💰 |  | #3963 | .block-ready | PR #3963 title-match only, unverified |
| home-2-open-loads-inflight-late-consistency-un | NEEDS-VERIFY | 💰 |  | #2435 | .block-ready | PR #2435 title-match only, unverified |
| M1-POSITIONED-PARTS | NEEDS-VERIFY |  |  |  | .block-ready | 2/4 signature file(s) on main — partial, unverified |
| maint2-open-wos-kpi-table-consistency | NEEDS-VERIFY | 💰 |  | #2645 | .block-ready | PR #2645 title-match only, unverified |
| PHASE3_INVOICE-FK_unenforced-linkages_DISPATCH | NEEDS-VERIFY | 💰 |  | #4008 | .block-ready | [verified 2026-07-12] agent: not dispositioned in #2385; needs live FK check |
| PHASE3_TRANSFER-MIGRATION-DRIFT_held-but-live_VERIFY | NEEDS-VERIFY | 💰 |  | #4008 | .block-ready | [verified 2026-07-12] agent: not dispositioned in #2385; needs live migration-drift check |
| product-service-categories-rename-and-creator | NEEDS-VERIFY | 💰 |  |  | .block-ready | [verified 2026-07-12] agent: parent-category creator not built (QboCategoriesListPage.tsx) |
| RECON-00 | NEEDS-VERIFY |  |  | #2300 | .block-ready | PR #2300 title-match only, unverified |
| RECON-01 | NEEDS-VERIFY | 💰 |  |  | .block-ready | 3/4 signature file(s) on main — partial, unverified |
| s-02-insurance-sidebar-not-standalone | NEEDS-VERIFY | 💰 |  | #5377 | .block-ready | PR #5377 title-match only, unverified |
| s-07-log-event-missing-dot-fields | NEEDS-VERIFY | 💰 |  | #5360 | .block-ready | PR #5360 title-match only, unverified |
| s-10-no-type-filter-incidents | NEEDS-VERIFY | 💰 |  | #5279 | .block-ready | PR #5279 title-match only, unverified |
| UI-03_INLINE-CREATE-AND-BANKING-SPLIT_DISPATCH | NEEDS-VERIFY | 💰 |  | #2342 | .block-ready | [verified 2026-07-12] agent: PR #2342 Part-A vocab only; Account/COA inline-create still deferred |
| VISUAL-SAFETY | NEEDS-VERIFY | 💰 |  | #2262 | .block-ready | PR #2262 title-match only, unverified |
| VISUAL-SETTLEMENTS | NEEDS-VERIFY | 💰 |  | #2262 | .block-ready | PR #2262 title-match only, unverified |
| 0243-d4-1-samsara-webhook-driver-pairing-equip | DONE | 💰 |  |  | .block-ready | all 3 file(s) on main |
| 0243-g5-4-n-plus-1-report-loops-select-star | DONE | 💰 |  |  | .block-ready | all 4 file(s) on main |
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
| A1-AUDIT-SPINE-LINK-COLUMNS | DONE | 💰 |  |  | .block-ready | all 2 file(s) on main |
| A2-AUDIT-EMIT-DISPATCH | DONE |  |  |  | .block-ready | [verified 2026-07-12] block own verify-*.mjs guard passes on main (built+wired) |
| A3-AUDIT-EMIT-MAINTENANCE | DONE |  |  |  | .block-ready | [verified 2026-07-12] block own verify-*.mjs guard passes on main (built+wired) |
| A4-AUDIT-EMIT-ACCOUNTING | DONE |  |  |  | .block-ready | all 7 file(s) on main |
| A5-AUDIT-EMIT-BANKING | DONE |  |  |  | .block-ready | [verified 2026-07-12] block own verify-*.mjs guard passes on main (built+wired) |
| A6-AUDIT-UNIVERSAL-VIEW | DONE |  |  |  | .block-ready | [verified 2026-07-12] block own verify-*.mjs guard passes on main (built+wired) |
| A7-AUDIT-PER-ENTITY-TABS | DONE |  |  |  | .block-ready | [verified 2026-07-12] block own verify-*.mjs guard passes on main (built+wired) |
| A8-AUDIT-REPORTS-SECTION | DONE |  |  |  | .block-ready | [verified 2026-07-12] block own verify-*.mjs guard passes on main (built+wired) |
| A9-AUDIT-CI-EMIT-GUARD | DONE |  |  |  | .block-ready | all 1 file(s) on main |
| accounting-sortable-headers-guard-wiring | DONE | 💰 |  | #2732 | .block-ready | PR #2732 merged 2026-07-19 |
| ACCT-BLOCK-10-ACCOUNT-BALANCES | DONE |  |  |  | .block-ready | all 3 file(s) on main |
| ACCT-BLOCK-11-PERIODS-INIT | DONE |  |  |  | .block-ready | all 1 file(s) on main |
| ACCT-COA-CANONICALIZATION | DONE |  |  |  | .block-ready | all 3 file(s) on main |
| ACCT-F05-BANKFEED-JE-MATCH | DONE | 💰 |  | #3517 | .block-ready | PR #3517 merged 2026-07-25 |
| ACCT-F10 | DONE | 💰 |  | #3500 | .block-ready | PR #3500 merged 2026-07-25 |
| acct-f275-load-count-both-paths | DONE | 💰 |  | #5142 | .block-ready | PR #5142 merged 2026-08-09 |
| ACCT-F288-SETTLEMENT-LINE-BILL-LINK | DONE | 💰 |  | #5129 | .block-ready | PR #5129 merged 2026-08-09 |
| acct-f289-zero-rate-refusal-blast-radius | DONE | 💰 |  | #5137 | .block-ready | PR #5137 merged 2026-08-09 |
| acct-f290-bookend-canonical-bill-path | DONE | 💰 |  | #5139 | .block-ready | PR #5139 merged 2026-08-09 |
| acct-fmcsa-fire-and-forget-retry | DONE | 💰 |  | #2716 | .block-ready | PR #2716 merged 2026-07-19 |
| ACCT-INTEGRITY-VERIFY-EXTEND | DONE |  |  |  | .block-ready | all 5 file(s) on main |
| ACCT-LINK-04-EXPENSE-CATEGORY-FK | DONE | 💰 |  | #3446 | .block-ready | PR #3446 merged 2026-07-25 |
| ACCT-QBOPAR-01-CATALOG-BACKEND | DONE |  |  |  | .block-ready | all 16 file(s) on main |
| ACCT-QBOPAR-02 | DONE |  |  |  | .block-ready | all 17 file(s) on main |
| ACCT-QBOPAR-03 | DONE |  |  |  | .block-ready | all 6 file(s) on main |
| ACCT-QBOPAR-04 | DONE |  |  |  | .block-ready | all 6 file(s) on main |
| ACCT-R-03-COA-MERGE-REPOINT | DONE | 💰 |  | #3526 | .block-ready | PR #3526 merged 2026-07-26 |
| AF-0-rebaseline | DONE | 💰 | T3 | #1264 | program | [verified 2026-07-03] doc block; PR #1264 doc on main |
| AF-3-account-registers | DONE | 💰 | T2 |  | program | [verified 2026-07-03] account-register routes/service + page live on main |
| AF-6-finance-hub | DONE | 💰 | T2 |  | program | [verified 2026-07-03] finance-hub routes/service + page on main (flag-gated OFF by design) |
| ap-control-test-isolation | DONE | 💰 |  | #2719 | .block-ready | PR #2719 merged 2026-07-19 |
| at-risk-queue-error-entitylink | DONE |  |  | #2869 | .block-ready | PR #2869 merged 2026-07-20 |
| BANK-18-DESIGNVIEW-QBO-PARITY | DONE | 💰 |  | #3131 | .block-ready | all 2 file(s) on main |
| BANK-18-KEYSTONE-CATEGORIZE-REGISTER | DONE | 💰 |  | #3131 | .block-ready | all 4 file(s) on main |
| BANK-ECON-05-GATE-01 | DONE | 💰 |  | #3502 | .block-ready | PR #3502 merged 2026-07-25 |
| BANK-MODULE-DOD | DONE | 💰 |  | #3509 | .block-ready | PR #3509 merged 2026-07-25 |
| BANK-SORT-ROLLOUT-ACCT | DONE |  |  | #2602 | .block-ready | PR #2602 merged 2026-07-17 |
| BANK-SORT-ROLLOUT-ACCT-CUSTVEND | DONE |  |  | #2609 | .block-ready | PR #2609 merged 2026-07-17 |
| bank-splits-vendor-bill-gl-atomic | DONE | 💰 |  | #2717 | .block-ready | PR #2717 merged 2026-07-19 |
| banking-1-uncategorized-kpi-reconciliation | DONE | 💰 |  | #1724 | .block-ready | [verified 2026-07-11] PR #1724 merged 707ebd735 (KPI count alignment, no money movement); apps/backend/src/banking/pendi |
| biz-flow-8-no-transfer-notifications | DONE | 💰 |  | #2821 | .block-ready | PR #2821 merged 2026-07-20 |
| BK7-INLINE-CREATE-DRAWERS | DONE |  |  |  | .block-ready | all 3 file(s) on main |
| BLOCK-04-of-29-TIER2-RATE-LIMIT | DONE |  | T2 |  | enterprise-29 | all 1 named artifact(s) on main |
| BLOCK-05-of-29-TIER2-CIRCUIT-BREAKERS | DONE |  | T2 |  | enterprise-29 | all 1 named artifact(s) on main |
| BLOCK-05-TIER2-CIRCUIT-BREAKERS | DONE |  |  |  | .block-ready | all 8 file(s) on main |
| BLOCK-06-of-29-TIER2-OUTBOX-DLQ | DONE |  | T2 |  | enterprise-29 | all 1 named artifact(s) on main |
| BLOCK-07-of-29-TIER2-PAGINATION-AUDIT | DONE |  | T2 |  | enterprise-29 | all 1 named artifact(s) on main |
| BLOCK-08-of-29-TIER2-LOAD-TEST | DONE |  | T2 |  | enterprise-29 | all 1 named artifact(s) on main |
| BLOCK-08-TIER2-LOAD-TEST | DONE |  |  |  | .block-ready | all 2 file(s) on main |
| BLOCK-09-of-29-TIER2-E2E-PATHS | DONE |  | T2 |  | enterprise-29 | all 1 named artifact(s) on main |
| BLOCK-09-TIER2-E2E-PATHS | DONE |  |  |  | .block-ready | all 2 file(s) on main |
| block-10-account-balances | DONE | 💰 |  |  | accounting | all 3 named artifact(s) on main |
| BLOCK-10-driver-inactivity | DONE |  | T1 |  | program | all 2 named artifact(s) on main |
| BLOCK-10-of-29-TIER2-RLS-TEST-GATE | DONE |  | T2 |  | enterprise-29 | all 1 named artifact(s) on main |
| BLOCK-11-of-29-TIER2-AUDIT-COVERAGE | DONE |  | T2 |  | enterprise-29 | all 1 named artifact(s) on main |
| BLOCK-12-of-29-TIER2-DESTRUCT-PREFLIGHT | DONE |  | T2 |  | enterprise-29 | all 1 named artifact(s) on main |
| BLOCK-13-of-29-TIER2-TUNING-CATALOG | DONE |  | T2 |  | enterprise-29 | all 1 named artifact(s) on main |
| BLOCK-13-TIER2-TUNING-CATALOG | DONE |  |  |  | .block-ready | all 2 file(s) on main |
| BLOCK-14-of-29-TIER2.5-MEXICO-OPS | DONE |  | T2.5 |  | enterprise-29 | all 2 named artifact(s) on main |
| BLOCK-15-of-29-TIER2.5-MECHANIC-SHOP | DONE |  | T2.5 |  | enterprise-29 | all 2 named artifact(s) on main |
| BLOCK-16-COMPLIANCE-DASHBOARD | DONE |  |  |  | .block-ready | all 20 file(s) on main |
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
| block-cf-cash-forecast | DONE | 💰 |  |  | accounting | all 2 named artifact(s) on main |
| block-cmc-month-close-wizard | DONE | 💰 |  |  | accounting | all 1 named artifact(s) on main |
| BLOCK-D-INSURANCE-RENEWAL | DONE |  |  |  | .block-ready | all 2 file(s) on main |
| BLOCK-E-INSURANCE-FLEET | DONE |  |  |  | .block-ready | all 3 file(s) on main |
| BLOCK-G-COI-PDF | DONE |  |  |  | .block-ready | all 4 file(s) on main |
| BLOCK-H-DETENTION-NOTIFY | DONE |  |  |  | .block-ready | all 2 file(s) on main |
| BLOCK-I-CI-DIST-FIX | DONE | 💰 |  | #3976 | .block-ready | all 1 file(s) on main |
| BLOCK-J-MASTER-DATA-GRANT | DONE |  |  |  | .block-ready | all 2 file(s) on main |
| block-ppc-period-comparison | DONE | 💰 |  |  | accounting | all 1 named artifact(s) on main |
| BLOCK5-INSURANCE-FORWARD-FIX | DONE |  |  |  | .block-ready | all 5 file(s) on main |
| BLOCK7-DRIVER-HUB-REQUESTS | DONE |  |  |  | .block-ready | all 5 file(s) on main |
| BLOCKS-ACCOUNTING | DONE |  |  |  | program | all 1 named artifact(s) on main |
| BLOCKS-ACCOUNTING-DOM-2026-07-26 | DONE |  |  |  | program | all 1 named artifact(s) on main |
| BLOCKS-BANKING | DONE |  |  |  | program | all 3 named artifact(s) on main |
| BLOCKS-BANKING-DOM-2026-07-26 | DONE |  |  |  | program | all 3 named artifact(s) on main |
| BLOCKS-FACTORING | DONE |  |  |  | program | all 3 named artifact(s) on main |
| BLOCKS-INSURANCE | DONE |  |  |  | program | all 4 named artifact(s) on main |
| BLOCKS-MAINTENANCE | DONE |  |  |  | program | all 4 named artifact(s) on main |
| BLOCKS-SETTLEMENTS | DONE |  |  |  | program | all 5 named artifact(s) on main |
| bnk-03-no-last-reconciled-no-beginning-balance | DONE |  |  | #2834 | .block-ready | PR #2834 merged 2026-07-20 |
| BUG-ADD-USER-INERT | DONE |  |  |  | .block-ready | all 5 file(s) on main |
| C1-PRE-SETTLEMENTS | DONE |  |  |  | .block-ready | all 4 file(s) on main |
| C2-FACTORING-PROFILE | DONE |  |  |  | .block-ready | all 5 file(s) on main |
| C3-CUSTOMER-CONTRACT-UPLOAD | DONE |  |  |  | .block-ready | all 7 file(s) on main |
| C4-CUST-VEND-REBUILD-RECLASSIFY | DONE |  |  |  | .block-ready | all 4 file(s) on main |
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
| CHORE-UNVERIFIED-ROWS-RECONCILE | DONE | 💰 |  |  | .block-ready | all 1 file(s) on main |
| CI-DETERMINISTIC-SCHEMA-PARITY-BASELINE | DONE | 💰 |  | #2693 | .block-ready | PR #2693 merged 2026-07-18 |
| CLOSURE-12-CYCLE5-PAYROLL-INTEGRATION | DONE |  |  |  | .block-ready | all 10 file(s) on main |
| CLOSURE-13-USMCA-JULY-LAUNCH | DONE |  |  |  | .block-ready | all 6 file(s) on main |
| CLOSURE-17-ON-HOLD-TRIAGE | DONE |  |  |  | .block-ready | all 1 file(s) on main |
| CLOSURE-18-PERF-AUDIT | DONE |  |  |  | .block-ready | all 3 file(s) on main |
| CLOSURE-19-SEC-AUDIT | DONE |  |  |  | .block-ready | all 2 file(s) on main |
| CLOSURE-20-A11Y-AUDIT | DONE |  |  |  | .block-ready | all 2 file(s) on main |
| CLOSURE-21-MONITORING-SETUP | DONE |  |  |  | .block-ready | all 7 file(s) on main |
| CLOSURE-23-DR-BACKUP-AUDIT | DONE |  |  |  | .block-ready | all 2 file(s) on main |
| CLOSURE-24-OPERATOR-ONBOARDING | DONE |  |  |  | .block-ready | all 11 file(s) on main |
| coder-work-order-t2-3-xlsx-cve | DONE | 💰 |  | #2686 | .block-ready | PR #2686 merged 2026-07-18 |
| compliance-1-stale-units-segregation | DONE | 💰 |  | #1720 | .block-ready | [verified 2026-07-11] PR #1720 merged a53ceabff (non-financial); apps/frontend/src/pages/compliance/FleetHosBoardSection |
| CONN-2-factoring-faro | DONE | 💰 |  |  | program | [verified 2026-07-12] agent: routes+reserve-tracker wired, migration HELD (poster.service.ts:276-530) |
| CPA-ANSWERS-PHASE1 | DONE |  |  | #2707 | .block-ready | PR #2707 merged 2026-07-19 |
| CUSTVEND-PAR-1 | DONE | 💰 |  | #2286 | .block-ready | PR #2286 merged 2026-07-08 |
| D-CAL-1-datepicker-parity | DONE | 💰 |  | #2325 | .block-ready | PR #2325 merged 2026-07-11 |
| D-CREATE-INLINE-referenceselect | DONE | 💰 |  | #2326 | .block-ready | PR #2326 merged 2026-07-11 |
| D-CREATE-VERIFY-DEAD-FORMS-UNMOUNTED | DONE |  |  |  | .block-ready | [verified 2026-07-12] verify-dead-forms-unmounted.mjs + verify-steps/110 + package.json:866; guard PASS (11 dead forms u |
| D-SECTION7-EMOJI-cleanup | DONE | 💰 |  | #2327 | .block-ready | PR #2327 merged 2026-07-11 |
| D1-SETTLEMENTS-APPROVAL-PDF | DONE |  |  |  | .block-ready | all 5 file(s) on main |
| d5-driver-detail-scope-optional-param | DONE | 💰 |  | #2661 | .block-ready | PR #2661 merged 2026-07-17 |
| DESIGN-STD-NAVY-PAGE-BANNER | DONE |  |  |  | .block-ready | all 3 file(s) on main |
| DISP-FACTORING-PACKET | DONE |  |  |  | .block-ready | all 6 file(s) on main |
| DISP-KANBAN-dispatch-kanban-board | DONE |  |  |  | program | all 2 named artifact(s) on main |
| DISP-KANBAN-STATES | DONE |  |  |  | .block-ready | all 1 file(s) on main |
| DISP-LIST-TABLE-ASSIGN | DONE |  |  |  | .block-ready | all 1 file(s) on main |
| DISP-OVERVIEW | DONE |  |  |  | .block-ready | all 2 file(s) on main |
| DISP-OVERVIEW-dispatch-overview | DONE |  |  |  | program | all 2 named artifact(s) on main |
| DISP-PLANNERS | DONE |  |  |  | .block-ready | all 11 file(s) on main |
| DISP-PROFIT-load-profitability | DONE |  |  |  | program | all 2 named artifact(s) on main |
| DISP-PROFITABILITY | DONE |  |  |  | .block-ready | all 6 file(s) on main |
| DISP-QUEUES-NAV | DONE |  |  |  | .block-ready | all 2 file(s) on main |
| DISP-ROUNDTRIPS | DONE |  |  |  | .block-ready | all 3 file(s) on main |
| DISPATCH-LIVE-ETA | DONE |  |  |  | .block-ready | all 7 file(s) on main |
| dispatch-sweep-gap-25 | DONE |  |  | #2812 | .block-ready | PR #2812 merged 2026-07-20 |
| DOC-17-DEFINITION-OF-DONE | DONE | 💰 |  | #2370 | .block-ready | all 1 file(s) on main |
| driverhub-2-demo-duplicate-drivers-cleanup | DONE | 💰 |  | #1721 | .block-ready | [verified 2026-07-11] PR #1721 merged 27cf6a9ce; demo-data-exclusion guard test + units.routes.ts/driver-scheduler.servi |
| E1-SMOKE-SERVICE-TOKEN-AUTH | DONE |  |  |  | .block-ready | [verified 2026-07-12] block own verify-*.mjs guard passes on main (built+wired) |
| entitylink-driver-load-history | DONE |  |  | #2854 | .block-ready | PR #2854 merged 2026-07-20 |
| expenses-list-route-still-shows-create-wizard | DONE | 💰 |  |  | .block-ready | all 13 file(s) on main |
| FACT-FIX-1 | DONE |  |  | #2278 | .block-ready | PR #2278 merged 2026-07-07 |
| fact-fix1-duplicate-vendors-banner | DONE | 💰 |  | #2813 | .block-ready | PR #2813 merged 2026-07-20 |
| FACT-PAR-1 | DONE | 💰 |  | #2287 | .block-ready | PR #2287 merged 2026-07-08 |
| FACT-PAR-2 | DONE |  |  | #2282 | .block-ready | PR #2282 merged 2026-07-07 |
| fact-par1-submissionqueue-unrouted | DONE |  |  | #2816 | .block-ready | PR #2816 merged 2026-07-20 |
| FEAT-ACCOUNT-REGISTER-D5 | DONE |  |  |  | .block-ready | all 6 file(s) on main |
| FEAT-B1-EXPENSE-CATEGORY-MAP-SEED | DONE |  |  |  | .block-ready | all 1 file(s) on main |
| FEAT-B2-POSTING-ENGINE-CASH-ADVANCE | DONE |  |  |  | .block-ready | all 2 file(s) on main |
| FEAT-B3-EMPLOYEE-LOAN-LEDGER | DONE |  |  |  | .block-ready | all 4 file(s) on main |
| FEAT-B4-DRIVER-REQUEST-AUDIT-TIMELINE | DONE |  |  |  | .block-ready | all 5 file(s) on main |
| FEAT-B5-CASH-ADVANCE-APPROVE-CASCADE | DONE |  |  |  | .block-ready | all 5 file(s) on main |
| FEAT-B6-DRIVER-INBOX-UI | DONE | 💰 |  |  | .block-ready | all 5 file(s) on main |
| FEAT-CLASSES-BULK-EDIT | DONE |  |  |  | .block-ready | all 4 file(s) on main |
| FEAT-DISP-CASHFLOW-LINK | DONE |  |  |  | .block-ready | all 1 file(s) on main |
| FEAT-DISPATCH-PLANNERS-SPLIT-NAV | DONE |  |  |  | .block-ready | all 1 file(s) on main |
| FEAT-DOCS-UPLOAD-UI | DONE |  |  |  | .block-ready | all 2 file(s) on main |
| FEAT-DRIVER-ESCROW-SUBACCOUNT-V2 | DONE | 💰 |  |  | .block-ready | all 2 file(s) on main |
| FEAT-DRIVER-HUB-ROUTE-WIRE | DONE |  |  |  | .block-ready | all 1 file(s) on main |
| FEAT-DRIVER-INBOX-REPORTING | DONE |  |  |  | .block-ready | all 7 file(s) on main |
| FEAT-DRIVER-SUBACCOUNT-ASSET-PROVISION | DONE | 💰 |  |  | .block-ready | all 2 file(s) on main |
| FEAT-DRIVER-SUBACCOUNT-BULK-BACKFILL-DRYRUN | DONE | 💰 |  |  | .block-ready | all 4 file(s) on main |
| FEAT-EXPENSES-PHASE1-5-BUILD | DONE | 💰 |  |  | .block-ready | all 3 file(s) on main |
| FEAT-EXPENSES-PHASE1-FOUNDATION | DONE | 💰 |  |  | .block-ready | all 3 file(s) on main |
| FEAT-EXPENSES-PHASE2-STEP3-POSTING-BUILD | DONE | 💰 |  |  | .block-ready | all 4 file(s) on main |
| FEAT-EXPENSES-PHASE2-UNCATEGORIZED-SEED | DONE | 💰 |  |  | .block-ready | all 3 file(s) on main |
| FEAT-FH-2-LOAN-WIZARD | DONE | 💰 |  |  | .block-ready | all 11 file(s) on main |
| FEAT-FH-3-AMORTIZATION | DONE | 💰 |  |  | .block-ready | all 10 file(s) on main |
| FEAT-FH-4-CALCULATOR | DONE | 💰 |  |  | .block-ready | all 10 file(s) on main |
| FEAT-FH1-FIXED-ASSETS-DATA-MODEL | DONE | 💰 |  |  | .block-ready | all 2 file(s) on main |
| FEAT-HELP-ARTICLE-STUBS | DONE |  |  |  | .block-ready | all 1 file(s) on main |
| FEAT-HIDE-STUB-NAV-PAGES | DONE |  |  |  | .block-ready | all 2 file(s) on main |
| FEAT-INSURANCE-POLICY-WIZARD | DONE |  |  |  | .block-ready | all 12 file(s) on main |
| FEAT-INVENTORY-PARTS-404-FIX | DONE | 💰 |  |  | .block-ready | all 2 file(s) on main |
| FEAT-PERIODS-INIT-TRK-2025-H2 | DONE | 💰 |  |  | .block-ready | all 1 file(s) on main |
| FEAT-QBO-PARITY-A1-TABLE-GRAMMAR | DONE |  |  |  | .block-ready | all 1 file(s) on main |
| FEAT-QBO-PARITY-A3-SIZING | DONE |  |  |  | .block-ready | all 2 file(s) on main |
| FEAT-REEFER-HOURS-POLL-CRON | DONE |  |  |  | .block-ready | all 2 file(s) on main |
| FEAT-SETTLEMENT-DEDUCTION-LEDGER-DDL | DONE | 💰 |  |  | .block-ready | all 1 file(s) on main |
| FEAT-SETTLEMENT-RECOVERY-CAPPED-PAYROLL | DONE | 💰 |  |  | .block-ready | all 3 file(s) on main |
| FEAT-SETTLEMENT-SHADOW-RUN | DONE | 💰 |  |  | .block-ready | all 3 file(s) on main |
| FEAT-SIDEBAR-V2-REORG-25 | DONE |  |  |  | .block-ready | [verified 2026-07-12] block own verify-*.mjs guard passes on main (built+wired) |
| FEAT-TASK-BOARD-CREATE-TASK-UI | DONE |  |  |  | .block-ready | all 2 file(s) on main |
| FEAT-TRACKER-EXPORT-GITHUB-TABS | DONE |  |  |  | .block-ready | all 2 file(s) on main |
| FEAT-V0-SIDEBAR-DRIVER-HUB | DONE |  |  |  | .block-ready | all 2 file(s) on main |
| FEAT-V2-A2-REFERENCE-SELECT | DONE |  |  |  | .block-ready | all 1 file(s) on main |
| FEAT-VOID-EVERYWHERE-PR1 | DONE | 💰 |  |  | .block-ready | all 5 file(s) on main |
| FEAT-VOID-EVERYWHERE-PR2 | DONE | 💰 |  |  | .block-ready | all 4 file(s) on main |
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
| FIX-AT-RISK-LOADS-SD-CITY | DONE |  |  |  | .block-ready | all 1 file(s) on main |
| FIX-AUDIT-PROD-STUBS | DONE |  |  |  | .block-ready | all 1 file(s) on main |
| FIX-AUDIT-TRIGGER-DRIFT | DONE |  |  |  | .block-ready | all 1 file(s) on main |
| FIX-CANARY-SMOKE-DURABLE | DONE |  |  |  | .block-ready | all 1 file(s) on main |
| FIX-COA-UNCATEGORIZED-EXPENSE-QBO-RECONCILE | DONE | 💰 |  |  | .block-ready | all 2 file(s) on main |
| FIX-CUSTOMER-INVOICE-CUSTOMER-ID-DEEPLINK | DONE | 💰 |  | #2592 | .block-ready | PR #2592 merged 2026-07-16 |
| FIX-DEPLOY-MIGRATION-DRIFT | DONE | 💰 |  |  | .block-ready | all 9 file(s) on main |
| FIX-DISPATCH-DRIVER-PICKER-50-CAP | DONE |  |  |  | .block-ready | [verified 2026-07-12] InlineDriverPicker.tsx:26 + BookLoadEquipmentSection.tsx:92 pass limit:200 |
| FIX-DISPATCH-FACTORING-QUEUE-DEEPLINKS | DONE | 💰 |  | #2593 | .block-ready | PR #2593 merged 2026-07-17 |
| FIX-DISPATCH-SUBNAV-ROUTING | DONE |  |  |  | .block-ready | all 4 file(s) on main |
| FIX-DOUBLE-STRINGIFY-SWEEP-NONMONEY | DONE |  |  |  | .block-ready | all 6 file(s) on main |
| FIX-DRIVERS-FULL-NAME-PHANTOM | DONE |  |  |  | .block-ready | [verified 2026-07-12] no d.full_name refs remain; guard test driver-full-name-phantom.db.test.ts asserts count=0 |
| FIX-FINANCE-DOUBLE-STRINGIFY-SWEEP | DONE |  |  |  | .block-ready | all 6 file(s) on main |
| FIX-FUEL-SUBNAV-ROUTING | DONE |  |  |  | .block-ready | all 4 file(s) on main |
| FIX-GUARD-M2-FK-DETECTION | DONE |  |  |  | .block-ready | all 1 file(s) on main |
| FIX-INSURANCE-POLICY-UNIT-IS-ACTIVE | DONE | 💰 |  |  | .block-ready | all 2 file(s) on main |
| FIX-LEGAL-FLEET-VEHICLE-TYPE-PHANTOM | DONE |  |  |  | .block-ready | [verified 2026-07-12] lease-to-own.service.ts:131 selects real u.vehicle_type AS unit_type + guard test |
| FIX-MAINTENANCE-SERVICES-ETA-PHANTOM | DONE |  |  |  | .block-ready | [verified 2026-07-12] services.routes.ts:107/118 repointed to telematics.vehicle_latest_position + maintenance.pm_schedu |
| FIX-PER-TRUCK-CPM-PERMITS-CTE | DONE |  |  |  | .block-ready | [verified 2026-07-12] cpm-calculator.service.ts:107 repointed to master_data.unit_permits (migration 0407) |
| FIX-PICKERS-50-CAP-UNITS-VENDORS-CUSTOMERS | DONE |  |  |  | .block-ready | [verified 2026-07-12] api/mdata.ts:26 forwards limit; InlineUnitPicker/InlineTrailerPicker limit:500 |
| FIX-REMOVE-LEFT-SIDEBAR-HOVER-DROPDOWN | DONE |  |  |  | .block-ready | all 1 file(s) on main |
| FIX-REQUIRED-CHECKS-GATE | DONE |  |  |  | .block-ready | all 1 file(s) on main |
| FIX-RLS-BILL-EXPENSE-LINES | DONE |  |  |  | .block-ready | all 1 file(s) on main |
| FIX-SAFETY-HOME-KPI-DRILLTHROUGH | DONE |  |  | #2615 | .block-ready | PR #2615 merged 2026-07-17 |
| FIX-SAFETY-NAV-COUNT | DONE |  |  |  | .block-ready | all 1 file(s) on main |
| FIX-STEP3-POSTING-BALANCED-JE-PROOF | DONE | 💰 |  |  | .block-ready | all 1 file(s) on main |
| FIX-TASK-CREATE-DOUBLE-STRINGIFY | DONE |  |  |  | .block-ready | all 1 file(s) on main |
| FIX-URL-NORMALIZE | DONE |  |  |  | .block-ready | all 1 file(s) on main |
| G1-verify-block-registry-complete | DONE | 💰 |  | #2316 | .block-ready | PR #2316 merged 2026-07-11 |
| G11-1-CLAIM-CROSSMODULE-FKS | DONE | 💰 |  | #2487 | .block-ready | PR #2487 merged 2026-07-14 |
| G2-verify-block-acceptance | DONE | 💰 |  | #2317 | .block-ready | PR #2317 merged 2026-07-11 |
| G3-verify-guard-wired | DONE | 💰 |  | #2318 | .block-ready | PR #2318 merged 2026-07-11 |
| G4-verify-canonical-table-writes | DONE | 💰 |  | #2321 | .block-ready | PR #2321 merged 2026-07-11 |
| gap-14-validation-pre-dispatch | DONE |  |  |  | gap-spec | all 6 named artifact(s) on main |
| gap-20-recurring-bills | DONE |  |  |  | gap-spec | all 2 named artifact(s) on main |
| GAP-23 | DONE |  |  |  | .block-ready | [verified 2026-07-12] block own verify-*.mjs guard passes on main (built+wired) |
| gap-23-samsara-cache-tiers | DONE |  |  |  | gap-spec | all 2 named artifact(s) on main |
| gap-25-active-driver-set | DONE |  |  |  | gap-spec | all 3 named artifact(s) on main |
| gap-26-border-crossings | DONE |  |  |  | gap-spec | all 2 named artifact(s) on main |
| gap-27-geofence-reconciliation | DONE |  |  |  | gap-spec | all 2 named artifact(s) on main |
| gap-28-layover-detection | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| gap-29-booking-gap-analytics | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| gap-30-late-arrival-analytics | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| gap-31-multi-stop-extra-rates | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-32 | DONE |  |  |  | .block-ready | all 7 file(s) on main |
| gap-32-customer-free-time-detention | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-34 | DONE |  |  |  | .block-ready | all 9 file(s) on main |
| gap-34-driver-pwa-dispatch | DONE |  |  |  | gap-spec | all 2 named artifact(s) on main |
| GAP-36 | DONE |  |  |  | .block-ready | all 12 file(s) on main |
| gap-36-driver-pwa-incident-full | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-37 | DONE |  |  |  | .block-ready | all 12 file(s) on main |
| gap-37-equipment-dual-confirm-transfer | DONE |  |  |  | gap-spec | all 5 named artifact(s) on main |
| GAP-38-DAMAGE-INSURANCE-CONTINUITY | DONE |  |  |  | .block-ready | all 7 file(s) on main |
| GAP-39 | DONE |  |  |  | .block-ready | all 9 file(s) on main |
| gap-39-geofence-state-machine | DONE |  |  |  | gap-spec | all 2 named artifact(s) on main |
| GAP-40 | DONE |  |  |  | .block-ready | all 11 file(s) on main |
| gap-40-damage-photo-exif-chain | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-41 | DONE |  |  |  | .block-ready | all 17 file(s) on main |
| gap-41-reports-hub-9-categories | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-42 | DONE |  |  |  | .block-ready | all 15 file(s) on main |
| gap-42-ifta-quarterly-preparer | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-43 | DONE |  |  |  | .block-ready | all 12 file(s) on main |
| gap-43-scheduled-reports | DONE |  |  |  | gap-spec | all 5 named artifact(s) on main |
| GAP-44 | DONE |  |  |  | .block-ready | all 14 file(s) on main |
| gap-44-form-425c-exhibits | DONE |  |  |  | gap-spec | all 2 named artifact(s) on main |
| GAP-45 | DONE |  |  |  | .block-ready | all 8 file(s) on main |
| gap-45-cash-flow-cpm-routes | DONE |  |  |  | gap-spec | all 2 named artifact(s) on main |
| GAP-46 | DONE |  |  |  | .block-ready | all 5 file(s) on main |
| gap-46-anomaly-detection | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| gap-47-dispatch-auth-gates | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-48 | DONE |  |  |  | .block-ready | all 31 file(s) on main |
| gap-48-driver-operations-depth | DONE |  |  |  | gap-spec | all 2 named artifact(s) on main |
| GAP-49 | DONE |  |  |  | .block-ready | all 13 file(s) on main |
| gap-49-dvir-severity-tagging | DONE |  |  |  | gap-spec | all 10 named artifact(s) on main |
| GAP-50 | DONE |  |  |  | .block-ready | all 13 file(s) on main |
| gap-50-ai-photo-comparison | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-51 | DONE |  |  |  | .block-ready | all 10 file(s) on main |
| GAP-52 | DONE |  |  |  | .block-ready | all 8 file(s) on main |
| gap-52-driver-vendor-mapping-integrity | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-53 | DONE |  |  |  | .block-ready | all 4 file(s) on main |
| gap-53-bank-multi-company-drift | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-54 | DONE |  |  |  | .block-ready | all 4 file(s) on main |
| gap-54-wf-051-250-foot-correction | DONE |  |  |  | gap-spec | all 2 named artifact(s) on main |
| GAP-55 | DONE |  |  |  | .block-ready | all 13 file(s) on main |
| gap-55-cap-1-live-gps | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-56 | DONE |  |  |  | .block-ready | all 8 file(s) on main |
| gap-56-cap-4-auto-status-switch | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-57 | DONE |  |  |  | .block-ready | all 9 file(s) on main |
| gap-57-cap-5-tri-signal | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-58 | DONE |  |  |  | .block-ready | all 8 file(s) on main |
| gap-58-cap-8-engine-fault-auto-wo | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-59 | DONE |  |  |  | .block-ready | all 7 file(s) on main |
| gap-59-cap-9-vehicle-driver-pairing | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-60 | DONE |  |  |  | .block-ready | all 14 file(s) on main |
| gap-60-cap-10-driver-scoring | DONE |  |  |  | gap-spec | all 6 named artifact(s) on main |
| GAP-61 | DONE |  |  |  | .block-ready | all 13 file(s) on main |
| gap-61-cap-11-fuel-fraud-alerts | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-62-CAP-12-TIRE-TREAD | DONE |  |  |  | .block-ready | all 12 file(s) on main |
| GAP-63 | DONE |  |  |  | .block-ready | all 11 file(s) on main |
| gap-63-cap-13-brake-wear | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-64 | DONE |  |  |  | .block-ready | all 10 file(s) on main |
| gap-64-cap-14-cargo-sensors | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| gap-65-owner-todays-attention | DONE |  |  |  | gap-spec | all 10 named artifact(s) on main |
| GAP-66-DISPATCHER-HOME | DONE |  |  |  | .block-ready | all 13 file(s) on main |
| gap-66-dispatcher-home-view | DONE |  |  |  | gap-spec | all 4 named artifact(s) on main |
| GAP-67-ACCOUNTING-HOME | DONE |  |  |  | .block-ready | all 12 file(s) on main |
| gap-67-accounting-home-view | DONE |  |  |  | gap-spec | all 2 named artifact(s) on main |
| GAP-68-SAFETY-OFFICER-HOME | DONE |  |  |  | .block-ready | all 12 file(s) on main |
| gap-68-safety-officer-home-view | DONE |  |  |  | gap-spec | all 7 named artifact(s) on main |
| GAP-69-DRIVER-MANAGER-HOME | DONE |  |  |  | .block-ready | all 7 file(s) on main |
| gap-69-driver-manager-home-view | DONE |  |  |  | gap-spec | all 7 named artifact(s) on main |
| gap-7-severe-repair-oos-estimate | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-70 | DONE |  |  |  | .block-ready | all 12 file(s) on main |
| gap-70-edi-foundation | DONE |  |  |  | gap-spec | all 2 named artifact(s) on main |
| gap-71-driver-retention-model | DONE |  |  |  | gap-spec | all 2 named artifact(s) on main |
| gap-72-customer-relationship-score | DONE |  |  |  | gap-spec | all 7 named artifact(s) on main |
| gap-76-deadhead-optimizer | DONE |  |  |  | gap-spec | all 2 named artifact(s) on main |
| GAP-8 | DONE |  |  |  | .block-ready | all 11 file(s) on main |
| gap-8-assignments-quicksave | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| gap-81-drug-alcohol-program | DONE |  |  |  | gap-spec | all 3 named artifact(s) on main |
| gap-82-cert-expiry-tracking | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-82-MEDICAL-CARD-TRACKING | DONE |  |  |  | .block-ready | all 11 file(s) on main |
| gap-83-eld-audit-trail | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-83-ELD-AUDIT-VIEWER | DONE |  |  |  | .block-ready | all 13 file(s) on main |
| GAP-84-DOT-INSPECTION-GAP-CLOSE | DONE |  |  |  | .block-ready | all 4 file(s) on main |
| GAP-85-PERMIT-TOLL-TRACKING | DONE |  |  |  | .block-ready | all 11 file(s) on main |
| gap-85-permits-toll-tags | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-86-INSURANCE-BILL-CREATOR | DONE |  |  |  | .block-ready | all 6 file(s) on main |
| gap-86-insurance-module | DONE |  |  |  | gap-spec | all 3 named artifact(s) on main |
| gap-87-audit-log-viewer | DONE |  |  |  | gap-spec | all 6 named artifact(s) on main |
| gap-89-cmd-k-quick-switcher | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-89-UNIVERSAL-SEARCH-CMD-K | DONE |  |  |  | .block-ready | all 13 file(s) on main |
| GAP-91-MOBILE-RESPONSIVE-AUDIT | DONE |  |  |  | .block-ready | all 8 file(s) on main |
| GAP-92-FEATURE-FLAG-SYSTEM | DONE |  |  |  | .block-ready | all 9 file(s) on main |
| gap-92-feature-flags | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-DOUBLE-ENTRY-DB-ENFORCEMENT | DONE |  |  |  | .block-ready | all 2 file(s) on main |
| GAP-E-PLANNER-TASKS-ROUTES | DONE |  |  |  | .block-ready | all 1 file(s) on main |
| GAP-PREMERGE-GATES-EXPAND | DONE |  |  |  | .block-ready | all 3 file(s) on main |
| GLOBAL-SORT-RULE | DONE |  |  |  | .block-ready | all 1 file(s) on main |
| h-02-qbo-sync-stale-no-action | DONE | 💰 |  | #2674 | .block-ready | PR #2674 merged 2026-07-17 |
| home-7-qbo-vendor-count-single-source | DONE | 💰 |  | #1668 | .block-ready | [verified 2026-07-12] agent: fixed PR #1668 (DefaultHome.tsx:168, OwnerHome.tsx:181) |
| HOS-BUG-DRIVERASSIGN | DONE |  | T2 |  | program | all 2 named artifact(s) on main |
| HOS-VIEWER-DONE | DONE |  |  |  | program | all 3 named artifact(s) on main |
| HOTFIX-0327-MIGRATION-ROLE | DONE |  |  |  | .block-ready | all 5 file(s) on main |
| IMPORT-0 | DONE |  |  |  | .block-ready | [verified 2026-07-12] block own verify-*.mjs guard passes on main (built+wired) |
| IMPORT-P0 | DONE | 💰 |  | #1797 | .block-ready | [verified 2026-07-12] merged PR #1797 |
| IMPORT-P0b | DONE | 💰 |  | #1802 | .block-ready | [verified 2026-07-12] merged PR #1802 |
| INS-MODULE | DONE |  |  |  | program | all 3 named artifact(s) on main |
| insurance-2-breadcrumb-desync | DONE | 💰 |  | #2830 | .block-ready | PR #2830 merged 2026-07-20 |
| ITEM-13-CEREMONY-VALIDATE-FKS | DONE | 💰 |  | #2368 | .block-ready | [verified 2026-07-11] 8 ceremony FKs convalidated=true on prod br-fancy-credit-akjnd07a (Neon MCP read-only) |
| ITEM-14-TXN-COMPANY-ISOLATION-GUARD | DONE | 💰 |  | #2363 | .block-ready | [verified 2026-07-11] prod: all accounting/banking/driver_finance policies scope to app.operating_company_id, 0 gaps; gu |
| ITEM1-TWO-SIDED-ITEM | DONE | 💰 |  |  | .block-ready | all 2 file(s) on main |
| item18-bills-mdata-vendor-fk | DONE | 💰 |  | #2333 | .block-ready | PR #2333 merged 2026-07-11 |
| late-arrivals-error-entitylink | DONE |  |  | #2861 | .block-ready | PR #2861 merged 2026-07-20 |
| LOCKDOWN-ENFORCEMENT-GUARDS | DONE |  |  |  | .block-ready | all 3 file(s) on main |
| m-01-wo-create-duplicate-header-fields | DONE | 💰 |  | #2304 | .block-ready | [verified 2026-07-11] PR #2304 merged f869528c4 (non-financial WO-modal visual sweep); apps/frontend/src/pages/maintenan |
| m-05-terms-field-raw-db-value | DONE | 💰 |  | #2304 | .block-ready | [verified 2026-07-11] PR #2304 merged f869528c4; apps/frontend/src/lib/billTermsLabel.ts humanizes raw terms enum, prese |
| m-07-wo-dev-facing-footer-text | DONE | 💰 |  | #2304 | .block-ready | [verified 2026-07-11] PR #2304 merged f869528c4; CreateWorkOrderModal.tsx footer copy fixed, present on main |
| m-08-integration-strip-duplicates-topbar | DONE | 💰 |  | #2304 | .block-ready | [verified 2026-07-11] PR #2304 merged f869528c4; CreateWorkOrderModal.tsx integration-strip dedup, present on main |
| m-09-wo-table-filters-no-visual-indicator | DONE | 💰 |  | #2304 | .block-ready | [verified 2026-07-11] PR #2304 merged f869528c4; apps/frontend/src/pages/maintenance/components/WorkOrdersTable.tsx acti |
| M2-INTEGRITY-POSITION-HISTORY | DONE |  |  |  | .block-ready | all 8 file(s) on main |
| MIGRATION-RUNNER-HARDEN | DONE |  |  |  | .block-ready | all 1 file(s) on main |
| MNT-SHOP | DONE |  |  |  | program | all 3 named artifact(s) on main |
| modsweep-verify-local-ci-parity | DONE | 💰 |  |  | .block-ready | all 1 file(s) on main |
| MX-OPS | DONE |  |  |  | program | all 3 named artifact(s) on main |
| NOTIF-A | DONE |  |  |  | .block-ready | [verified 2026-07-12] block own verify-*.mjs guard passes on main (built+wired) |
| OB1-NAV-HEADER-UNIFY | DONE |  |  |  | .block-ready | [verified 2026-07-12] block own verify-*.mjs guard passes on main (built+wired) |
| P0-BLOCK-3-DRIVER-LOAD-HISTORY | DONE |  |  |  | .block-ready | all 8 file(s) on main |
| P1-BILL-GL-create-bill-auto-gl-post | DONE | 💰 |  | #2323 | .block-ready | PR #2323 merged 2026-07-11 |
| P1-BILLPAY-GL-bill-payment-auto-gl-post | DONE | 💰 |  | #2324 | .block-ready | PR #2324 merged 2026-07-11 |
| P2-BANK-AUTOMATCH-observable | DONE | 💰 |  | #2331 | .block-ready | PR #2331 merged 2026-07-11 |
| P2-BILLLINE-LOADID-bill-lines-load-id | DONE | 💰 |  | #2330 | .block-ready | PR #2330 merged 2026-07-11 |
| P3-INVOICE-FK-detention-invoice-fk | DONE | 💰 |  | #2332 | .block-ready | PR #2332 merged 2026-07-11 |
| P4-05-incidents-auto-claim-fk | DONE | 💰 |  | #2335 | .block-ready | PR #2335 merged 2026-07-11 |
| P4-06-work-order-entity-fks | DONE | 💰 |  | #2334 | .block-ready | PR #2334 merged 2026-07-11 |
| P4-CROSSMODULE-FKS-batch | DONE | 💰 |  | #2336 | .block-ready | PR #2336 merged 2026-07-11 |
| paritytable-a1-controlled-expansion | DONE | 💰 |  | #3069 | .block-ready | PR #3069 merged 2026-07-21 |
| paritytable-a2-group-bands | DONE | 💰 |  | #3074 | .block-ready | PR #3074 merged 2026-07-21 |
| paritytable-a3-controlled-pagination | DONE | 💰 |  | #3082 | .block-ready | PR #3082 merged 2026-07-21 |
| paritytable-a4-external-sort | DONE | 💰 |  | #3086 | .block-ready | PR #3086 merged 2026-07-21 |
| paritytable-a5-controlled-selection | DONE | 💰 |  | #3087 | .block-ready | PR #3087 merged 2026-07-21 |
| pre-push-env-isolation | DONE | 💰 |  | #2722 | .block-ready | PR #2722 merged 2026-07-19 |
| pre-push-pipeline-deadlock-3b0b | DONE | 💰 |  | #2709 | .block-ready | PR #2709 merged 2026-07-19 |
| PREREQ-A-SCHEMA-GRANT-GATE | DONE |  |  |  | .block-ready | all 1 file(s) on main |
| PREREQ-B-SETTLEMENT-DEDUCTION-SVC | DONE |  |  |  | .block-ready | all 2 file(s) on main |
| PUSH-GATE-CLASSIFICATION-FRESHNESS | DONE | 💰 |  | #2689 | .block-ready | PR #2689 merged 2026-07-18 |
| Q9-TZ-timezone-library | DONE |  | T2 |  | program | all 1 named artifact(s) on main |
| qbo-ap-pull-dbflag-wire | DONE | 💰 |  | #2449 | .block-ready | all 4 file(s) on main |
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
| QBO-SYNC-DRIFT-401-FIX | DONE |  |  |  | .block-ready | [verified 2026-07-12] QBOSyncDriftDashboard.tsx:39/47 use apiRequest (credentials:include) |
| QSTD-00 | DONE | 💰 |  |  | .block-ready | all 1 file(s) on main |
| RECON-02 | DONE |  |  |  | .block-ready | all 2 file(s) on main |
| repair-b-driver-deduction-auth-template-not-se | DONE | 💰 |  |  | .block-ready | [verified 2026-07-12] agent: gate live-wired via hire-contract codes (signed-finance-handoff.service.ts:224-238) |
| revenue-gl-linkage-db-isolation | DONE | 💰 |  | #2723 | .block-ready | PR #2723 merged 2026-07-19 |
| REVENUE-RECOGNITION-TWO-EVENT-LATCH-2026-07-19 | DONE |  |  | #2733 | .block-ready | PR #2733 merged 2026-07-19 |
| revert-pr2720-tracker-artifacts | DONE | 💰 |  | #2721 | .block-ready | PR #2721 merged 2026-07-19 |
| RPT-MODULE | DONE |  |  |  | program | all 3 named artifact(s) on main |
| RPT-PAR-1 | DONE |  |  |  | .block-ready | all 9 file(s) on main |
| rpt-par1-mgmt-report-test-and-drill | DONE | 💰 |  | #2712 | .block-ready | PR #2712 merged 2026-07-19 |
| s-01-coverage-gap-count-no-red-alert | DONE | 💰 |  | #5420 | .block-ready | [verified 2026-07-11] PR #2306 merged 107d5e09b (non-financial Safety visual sweep); apps/frontend/src/pages/safety/tabs |
| s-04-no-from-to-date-range-safety-lists | DONE | 💰 |  | #2835 | .block-ready | PR #2835 merged 2026-07-20 |
| s-06-log-event-no-time-field | DONE |  |  | #2630 | .block-ready | PR #2630 merged 2026-07-17 |
| s-08-no-driver-unit-type-date-filters-incident | DONE |  |  | #2815 | .block-ready | PR #2815 merged 2026-07-20 |
| SAFE-W3 | DONE |  |  |  | program | all 3 named artifact(s) on main |
| SAFE-W4 | DONE |  |  |  | program | all 3 named artifact(s) on main |
| SAFE-W5 | DONE |  |  |  | program | all 3 named artifact(s) on main |
| SETTLEMENTS-SIDEBAR-RENAME-MOVE | DONE |  |  |  | .block-ready | all 4 file(s) on main |
| SHADOW-ROUTE-REDIRECTS | DONE |  |  |  | .block-ready | [verified 2026-07-12] block own verify-*.mjs guard passes on main (built+wired) |
| shared-catalog-creator-profile-debox | DONE | 💰 |  | #2697 | .block-ready | PR #2697 merged 2026-07-18 |
| SIDEBAR-INSURANCE | DONE |  |  |  | .block-ready | all 2 file(s) on main |
| SKILL-LINKAGE-permanent-autoload | DONE | 💰 |  | #2322 | .block-ready | PR #2322 merged 2026-07-11 |
| SMOKE-TOKEN-AUTH | DONE |  |  |  | .block-ready | all 6 file(s) on main |
| STMT-1-balance-sheet-cash-flow | DONE | 💰 | T2 |  | program | [verified 2026-07-03] balance-sheet + cash-flow routes live read-only |
| SWEEP-FIX-17-27 | DONE |  |  |  | .block-ready | all 11 file(s) on main |
| systemic-pattern-column-drift-guard | DONE |  |  | #2839 | .block-ready | PR #2839 merged 2026-07-20 |
| systemic-pattern-mandatory-error-states-dispatch-alerts | DONE |  |  | #2846 | .block-ready | PR #2846 merged 2026-07-20 |
| TASKS-PLANNER-REDESIGN-V3 | DONE |  |  |  | .block-ready | all 7 file(s) on main |
| TBL-STANDARD-INSURANCE-POLICIES | DONE |  |  |  | .block-ready | [verified 2026-07-12] PoliciesList.tsx:12/172 migrated to shared DataTable |
| TBL-STANDARD-universal-table-sweep | DONE |  | T2 | #2296 | program | branch feat/tbl-standard-dispatch-load-table → PR #2296 merged 2026-07-08 |
| TIER14-MEXICO-OPS | DONE |  |  |  | .block-ready | all 3 file(s) on main |
| TIER15-MECHANIC-SHOP | DONE |  |  |  | .block-ready | all 2 file(s) on main |
| TIER26-PARTITION | DONE |  |  |  | .block-ready | all 1 file(s) on main |
| TIER3-LIST-ERROR-STATES | DONE |  |  |  | .block-ready | [verified 2026-07-12] verify-list-error-state-coverage.mjs + verify-steps/112; guard PASS (20 list pages keep isError->L |
| type-date-input-sweep-incomplete | DONE | 💰 |  | #4965 | .block-ready | [verified 2026-07-12] agent: 0 raw type=date + verify-no-raw-date-input guard passes |
| UI-01_CALENDARS-AND-BOXES_DISPATCH | DONE | 💰 |  | #2337 | .block-ready | [verified 2026-07-11] dispatch twin of UI-01; PR #2337 merged 9baa803e0 (QB calendars + no-nested-box ratchet) on main |
| UI-01-CALENDARS-AND-FLAT-BOXES | DONE |  |  | #2337 | .block-ready | [verified 2026-07-11] PR #2337 merged 9baa803e0 — QuickBooks-format calendars everywhere + no-nested-box ratchet (2 guar |
| UI-02_QUICKBOOKS-PARITY-AND-WORKING-CREATE_DISPATCH | DONE | 💰 |  | #2339 | .block-ready | [verified 2026-07-11] dispatch twin of UI-02; PR #2339 merged 21bcc13c5 (create-forms-wired verify-first ratchet) on mai |
| UI-02-CREATE-FORMS-WIRED | DONE |  |  | #2339 | .block-ready | [verified 2026-07-11] PR #2339 merged 21bcc13c5; scripts/verify-create-forms-wired.mjs guard wired into locked-guards.ym |
| UI-03-PARTA-INLINE-CREATE | DONE |  |  | #2342 | .block-ready | [verified 2026-07-11] PR #2342 merged a1e520409 — inline '+ Create' vocab fix; scripts/verify-reference-dropdown-inline- |
| ui1-17-my-accountant-page | DONE | 💰 |  |  | .block-ready | [verified 2026-07-11] apps/frontend/src/pages/accounting/MyAccountantPage.tsx present + routed at /accounting/my-account |
| UNIFIED-TXN-REGISTER | DONE |  |  |  | .block-ready | [verified 2026-07-12] transaction-register.routes.ts present + autoloaded (index.ts:1011); FE lazy-mounted manifest.tsx: |
| USERS-1-PR-B | DONE | 💰 |  | #2281 | .block-ready | [verified 2026-07-12] merged PR #2281 |
| UX-A-table-alignment-DONE | DONE |  |  |  | program | all 1 named artifact(s) on main |
| UX-B-dispatch-location-column | DONE |  | T2 |  | program | all 1 named artifact(s) on main |
| UX-C-fleet-location | DONE |  | T2 |  | program | all 2 named artifact(s) on main |
| UX-D-hos-cycle-drawer | DONE |  | T2 |  | program | all 1 named artifact(s) on main |
| UX-E-compliance-hos-location | DONE |  | T2 |  | program | all 1 named artifact(s) on main |
| W1-EVENT-LOG-SPINE | DONE | 💰 |  |  | .block-ready | all 1 file(s) on main |
| W1A-EVENT-LOG-IMMUTABLE | DONE | 💰 |  |  | .block-ready | all 1 file(s) on main |
| W1B-TASKS-MODULE | DONE | 💰 |  |  | .block-ready | all 3 file(s) on main |
| W2A-PROFITABILITY-ENGINE | DONE | 💰 |  |  | .block-ready | all 10 file(s) on main |
| W2B-ALERT-RULES-PROFILES | DONE | 💰 |  |  | .block-ready | all 3 file(s) on main |
| W2P-PLANNER-REDESIGN | DONE | 💰 |  |  | .block-ready | all 5 file(s) on main |
| W3A-GEOFENCE-ENGINE | DONE | 💰 |  |  | .block-ready | all 4 file(s) on main |
| W3B-FORCED-DRIVER-ACK | DONE | 💰 |  | #2875 | .block-ready | all 3 file(s) on main |
| W4A-SIGNED-SAFETY-DOCS | DONE | 💰 |  | #2875 | .block-ready | all 3 file(s) on main |
| W4B-BROKER-AUTO-UPDATE | DONE | 💰 |  |  | .block-ready | all 3 file(s) on main |
| W5-TIME-UTILIZATION | DONE | 💰 |  |  | .block-ready | all 3 file(s) on main |
| WORKORDER-branch-rebuild-linear-URGENT | DONE |  |  |  | program | all 1 named artifact(s) on main |
| 0007-no-silent-noop-posting | AUDIT-NOTE | 💰 |  | #2319 | .block-ready | [verified 2026-08-02] [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — reconciler status |
| 0007-pattern-1-unmounted-backend | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0007-pattern-2-column-drift-500s | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0007-pattern-5-split-brain-engines | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0007-pattern-8-reverse-drill-through | AUDIT-NOTE | 💰 |  | #2725 | .block-ready | [verified 2026-08-02] [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — reconciler status |
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
| 0091-c1-1-settlement-engine-canonical | AUDIT-NOTE | 💰 |  | #2320 | .block-ready | [verified 2026-08-02] [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — reconciler status |
| 0091-c1-1-two-settlement-engines_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0091-d1-2 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0091-e1-4 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0091-flag-live-confirm-flag-state_DONE | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0091-g1-3 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0091-g10-h1 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0091-g10-h3 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0091-g11-2 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0091-g11-5 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0091-g6-1 | AUDIT-NOTE | 💰 |  | #2705 | .block-ready | [verified 2026-08-02] [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — reconciler status |
| 0091-g7-1 | AUDIT-NOTE | 💰 |  | #3068 | .block-ready | [verified 2026-08-02] [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — reconciler status |
| 0091-g7-1_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0091-g9-h1 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0091-g9-h4 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0091-g9-h5 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| 0091-g9-h6 | AUDIT-NOTE | 💰 |  | #2711 | .block-ready | [verified 2026-08-02] [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — reconciler status |
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
| 0243-d1-3-new-vendor-drawer-parity-fields | AUDIT-NOTE |  |  | #2822 | .block-ready | [verified 2026-08-02] [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — reconciler status |
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
| 0243-g8-4-a11y-input-labels | AUDIT-NOTE | 💰 |  | #2328 | .block-ready | [verified 2026-08-02] [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — reconciler status |
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
| ACCOUNTING-UI-POLISH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| ACCT-CASHFLOW-COMPANY-TZ | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| ACCT-QBOPAR-00-DESIGN-LOCK | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| AF-5-stub-catalogs | AUDIT-NOTE | 💰 | T2 |  | program | [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — stale 34-stub estimate; expense categor |
| AR-AP-PAYMENT-CONTRACT | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| audit10-payroll-automation-tax-withhol_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| audit19-ma-due-diligence-framework | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| audit4-tax-return-automation | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| audit5-fraud-anomaly-detection | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| audit7-cost-center-tracking | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| audit8-revenue-leakage-detection | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| banking-2-plaid-connections-error-state | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| banking-b4-driver-vendor-account-mapping | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| BANKING-CATEGORIZE-C1 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| BANKING-CSV-DIRECTION-M6 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| banking-grid-sort-resize-rows-per-page | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| BANKING-RECON-DEEPLINK-H4 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| BANKING-VIEW-POLISH-L10-H3 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
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
| BLOCK-10-TIER2-RLS-TEST-GATE | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| BLOCKS-NEW-DECISIONS | AUDIT-NOTE |  |  |  | program | [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — process/dispatch helper (OWNER-DECISION |
| C1-PICKER-LAW-replace-every-raw-UUID-input-with-the-canonica | AUDIT-NOTE |  |  |  | program | [verified 2026-08-02] EVAPORATE H5-EMPTY-WAVE per 08-BLOCK-BACKLOG-COUNT-CORRECTED-2026-08-01.md — 23 catalog-backed pic |
| CHORE-MASTER-TRACKER-MD | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| ci1-build-typecheck-flake-root-cause-and-guard | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| CLOSURE-16-DEEP-AUDIT-C | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
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
| DOC-CATALOGS-ACCOUNTS-FK-INVENTORY | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| DOC-CATALOGS-CLASSES-FK-INVENTORY | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| DOCS-AUDIT-LINKAGE-SPECS | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| DOCS-B9-ESCROW-DESIGN | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| DOCS-DISPATCH-LANE-ENFORCEMENT-V2 | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| DOCS-FACTORING-ACCOUNTING-STRUCTURE | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| DOCS-FH1-FIXED-ASSETS-DEPRECIATION | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| DOCS-FH1-LEASING-FOLLOWUP | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| DOCS-FH2-LOAN-WIZARD | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| DOCS-FH3-AMORTIZATION-ENGINE | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| DOCS-FH4-FINANCE-CALCULATOR | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| DOCS-FH5-BANKRUPTCY-MODELER | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| DOCS-FH5-POSTING-LOCKED | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| DOCS-FH6-TAX-MANAGER | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| DOCS-FH7-UNIT-ALLOCATION | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| DOCS-FH8-LEASE-CONTRACT | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| DOCS-FINANCE-ANSWERED-QS-FOLLOWUP | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| DOCS-GEOFENCE-INSURANCE-SPEC | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| DOCS-MILEAGE-LIFECYCLE-CORRECTION | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| DOCS-MILEAGE-MODEL-ANSWERS | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| DOCS-MILEAGE-MODEL-DESIGN | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| DOCS-PERMISSIONS-DESIGN | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| DOCS-QBO-PARITY-CAPTURE-V2 | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| DOCS-RECON-TRACKER-ESCROW-RESEARCH-0614 | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| DOCS-RELAY-INTERNAL-BANK-DESIGN | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| DOCS-RLS-COVERAGE-AUDIT | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| DOCS-ROLE-BINDINGS-WORKSHEET | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| DOCS-VOID-EVERYWHERE-DESIGN | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
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
| FEAT-QBO-PARITY-DOCS | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| fh-unit-allocation-ui-view-missing | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| FINAL-ADDITIONS-PAGE | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| FIX-AUDIT-KPI-DRIFTS | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| FIX-AUDIT-NESTED-MODALS | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| FIX-AUDIT-TEST-DATA-LEAK | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| FIX-CI-YML-CONFLICT-MARKERS | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| FIX-P8-AUDIT-NESTED-MODALS | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| FIX-SAMSARA-WEBHOOKS-INVESTIGATION | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| FIX-TEST-JSDOM-ENV-MISSING | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
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
| FOLLOWUP-SPECS-2026-06-07 | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| FOR-CURSOR-2-README-ACCOUNTING-BANKING | AUDIT-NOTE |  |  |  | program | [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — process/dispatch helper (class-sweep re |
| fuel-1-planner-diagram-empty-state | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| GAP-10-DELTA-CANCELLATIONS-REPORT | AUDIT-NOTE |  |  |  | .block-ready | [verified 2026-08-02] [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — reconciler status |
| GAP-11-DELTA-UPLOAD-EXPENSE | AUDIT-NOTE |  |  |  | .block-ready | [verified 2026-08-02] [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — reconciler status |
| GAP-14-PRE-DISPATCH-VALIDATION | AUDIT-NOTE |  |  |  | .block-ready | [verified 2026-08-02] [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — reconciler status |
| GAP-18-DRIVER-COMM-TIMELINE | AUDIT-NOTE | 💰 |  |  | .block-ready | [verified 2026-08-02] [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — reconciler status |
| GAP-19-DETENTION-INVOICE | AUDIT-NOTE |  |  |  | .block-ready | [verified 2026-08-02] [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — reconciler status |
| GAP-20 | AUDIT-NOTE |  |  |  | .block-ready | [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — reconciler status = DONE; not in active |
| GAP-24-FRESHNESS-INDICATOR | AUDIT-NOTE |  |  | #2400 | .block-ready | [verified 2026-08-02] [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — reconciler status |
| GAP-25 | AUDIT-NOTE |  |  | #2812 | .block-ready | [verified 2026-08-02] [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — reconciler status |
| GAP-26 | AUDIT-NOTE | 💰 |  |  | .block-ready | [verified 2026-08-02] [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — reconciler status |
| GAP-27 | AUDIT-NOTE | 💰 |  |  | .block-ready | [verified 2026-08-02] [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — reconciler status |
| GAP-28 | AUDIT-NOTE | 💰 |  | #3987 | .block-ready | [verified 2026-08-02] [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — reconciler status |
| GAP-29 | AUDIT-NOTE | 💰 |  |  | .block-ready | [verified 2026-08-02] [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — reconciler status |
| GAP-30 | AUDIT-NOTE |  |  |  | .block-ready | [verified 2026-08-02] [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — reconciler status |
| GAP-31 | AUDIT-NOTE |  |  |  | .block-ready | [verified 2026-08-02] [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — reconciler status |
| GAP-7 | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| GAP-71 | AUDIT-NOTE |  |  |  | .block-ready | [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — reconciler status = DONE; not in active |
| GAP-72 | AUDIT-NOTE |  |  |  | .block-ready | [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — reconciler status = DONE; not in active |
| GAP-76 | AUDIT-NOTE |  |  |  | .block-ready | [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — reconciler status = DONE; not in active |
| GAP-CI-WIRE-PREPUSH-GUARDS | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
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
| MANUAL-JE-CONTRACT | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
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
| P5-T6-BANKING-TRANSFER | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| PASTE-TO-CLAUDE-CODER | AUDIT-NOTE |  |  |  | program | [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — process/dispatch helper (class-sweep pa |
| PASTE-TO-CURSOR | AUDIT-NOTE |  |  |  | program | [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — process/dispatch helper (class-sweep pa |
| PERF-BUDGET-RAISE | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| PHASE0_DEPLOY-DRIFT_prod-older-than-main_VERIFY | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| phase12-audit210-energy | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| phase13-audit220-manufacturing-duplicate | AUDIT-NOTE | 💰 |  | #2385 | .block-ready | [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — generic industry audit block, no IH35 s |
| phase13-audit228-energy-duplicate | AUDIT-NOTE | 💰 |  | #2385 | .block-ready | [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — generic industry audit block, no IH35 s |
| phase14-audit-241 | AUDIT-NOTE | 💰 |  |  | .block-ready | [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — generic industry audit block, no IH35 s |
| PHASE2_ACCESSORIAL-REVENUE_divergent-engine_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| PHASE2_CANCEL-TONU_billable-cancellation-no-charge_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| PHASE2_LOAD-INVOICE_no-auto-ar_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| PHASE2_RECON-COLLECTOR_frozen-feed_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| phase3-audit57-process-audit-docs-workflow | AUDIT-NOTE | 💰 |  | #4008 | .block-ready | [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — generic process/docs audit block, no IH |
| phase3-audit62-spc | AUDIT-NOTE | 💰 |  | #4008 | .block-ready | [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — generic industry/quality audit block, n |
| phase3-audit64-capa | AUDIT-NOTE | 💰 |  | #4008 | .block-ready | [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — generic industry/quality audit block, n |
| phase3-audit65-preventive-action | AUDIT-NOTE | 💰 |  | #4008 | .block-ready | [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — generic industry/quality audit block, n |
| phase3-audit66-supplier-quality | AUDIT-NOTE | 💰 |  | #4008 | .block-ready | [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — generic industry/quality audit block, n |
| phase3-audit67-customer-satisfaction-csat-nps | AUDIT-NOTE | 💰 |  | #4008 | .block-ready | [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — generic industry/quality audit block, n |
| phase3-audit68-service-quality-sla | AUDIT-NOTE | 💰 |  | #4008 | .block-ready | [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — generic industry/quality audit block, n |
| phase3-audit69-product-quality | AUDIT-NOTE | 💰 |  | #4008 | .block-ready | [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — generic industry/quality audit block, n |
| phase3-audit70-manufacturing-qc | AUDIT-NOTE | 💰 |  | #4008 | .block-ready | [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — generic industry/quality audit block, n |
| phase3-audit71-laboratory | AUDIT-NOTE | 💰 |  | #4008 | .block-ready | [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — generic industry/quality audit block, n |
| phase3-audit72-calibration | AUDIT-NOTE | 💰 |  | #4008 | .block-ready | [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — generic industry/quality audit block, n |
| phase3-audit73-validation | AUDIT-NOTE | 💰 |  | #4008 | .block-ready | [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — generic industry/quality audit block, n |
| phase3-audit75-document-control | AUDIT-NOTE | 💰 |  | #4008 | .block-ready | [verified 2026-08-02] EVAPORATE per 07-BLOCK-REBUCKETING-2026-07-31 §EVAPORATE — generic industry/quality audit block, n |
| phase8-audit161-api-audit | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| public-audit-log-partitions-no-rls | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| QBO-BANK-WRITEBACK-GATE-M7 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| qbo-parity-resizable-columns-everywhere | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| qbo-realtime-webhook-sync | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| REGISTER-SOURCE-COL | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| repair-e-escrow-return-and-tieouts-des_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| ruling-3-driver-escrow-current-vs-long_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| ruling-4-embezzlement-reclass-off-ar-q_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| s-12-log-event-button-navy-cta | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| safety-dot-fields-and-driver-create-fix | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| safety2-cert-expiry-nav-distinct-route | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| settlement-posting-design-doc-missing_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| SIDEBAR-DRIVER-HUB | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| STRUCTURAL-MANIFEST-SPLIT | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| STRUCTURAL-MIGRATION-TIMESTAMPS | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| sweep-fix-17-27-fixture-names-and-pager | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| sweep-g11-1-deduction-consent-template_DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| sweepfix1727-8 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| systemic-pattern-mandatory-error-states | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| systemic-pattern-never-toast-success-posted-fa | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| systemic-pattern-r2-verify-bytes-guard | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| tbl-standard-raw-table-sweep-incomplete | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| TEST-COPY-TO-ACCOUNTING-LINES-BILL-BRANCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| threewayaudit-biz02-qbo-sync-workers-stale | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| TIER20-SECRETS-ROTATION | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| TIER21-DR-DRILL | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| TIER23-DEGRADATION | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| TIER27-CANARY | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| TIER28-VENDOR-LOCKIN | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| TIER29-KNOWN-LIMITATIONS | AUDIT-NOTE |  |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| USERS-DEACTIVATE | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| users-invited-status-distinct-from-active | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| usmca-banking-ingestion-dedup | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| USMCA-MASTERDATA-IMPORT | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| usmca-unhide-entity-switcher | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| vend1-pagination-total-vs-length | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| vend3-test-vendor-rows-visible | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| vend4-dual-qbo-sync-single-source-of-truth-dec | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| VENDOR-PROFILE-EDIT-BOX | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| VISUAL-ACCOUNTING | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| VISUAL-AUDIT-PUNCHLIST | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| VISUAL-BANKING | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| VISUAL-CASH-FLOW | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| VISUAL-COMPLIANCE | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| VISUAL-CUSTOMERS | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| VISUAL-DISPATCH | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| VISUAL-DOCS | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| VISUAL-DRIVER-HUB | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| VISUAL-DRIVERS | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| VISUAL-ELD | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| VISUAL-FACTORING | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| VISUAL-FINANCE | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| VISUAL-FLEET | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| VISUAL-FORM-425 | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| VISUAL-FUEL | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| VISUAL-HOME | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| VISUAL-INSURANCE | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| VISUAL-INVENTORY | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| VISUAL-LEGAL | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| VISUAL-LISTS | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| VISUAL-REMAINDER-LAYOUT | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| VISUAL-REPORTS | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| VISUAL-TASKS | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| VISUAL-USERS | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| VISUAL-VENDORS | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| wo-cancellation-reasons-fold-into-void-cancel- | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
| year-end-close-retained-earnings-asc852-freshs | AUDIT-NOTE | 💰 |  |  | .block-ready | no signature files in registry (prose note) — audit-finding; verify vs code/live, not this counter |
