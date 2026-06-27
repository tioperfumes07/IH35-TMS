# BLOCK RECONCILIATION — 2026-06-27 (every block, built vs pending — verified)

**DONE** = verified on main (branch merged or all signature files present).  **NEEDS-VERIFY** = weak signal (title-match / partial files / self-report), not trusted until GUARD confirms.  **PENDING** = needs build.  **PENDING (GATED)** = financial/locked, needs Jorge's gate first.

**Verified against `origin/main` (7065 files) + 1451 merged PRs.** A block is **DONE only if its branch merged OR all its signature files are present on main** — those are the only evidence. Weak signals (PR-title token match, partial files, a doc's own "shipped/done" self-report, a prior hardcoded built-claim) are **NEEDS-VERIFY** — not trusted until GUARD confirms. Nothing reads as DONE that wasn't really verified.

## Counts
- **PENDING**: 4
- **PENDING (GATED)**: 24
- **NEEDS-VERIFY**: 19
- **DONE**: 420

## Universe — why 467 blocks (the "456 vs 294 .block-ready" gap, explained)
The reconciler spans **5 sources**, de-duped by id — the block count is the union, **not** the `.block-ready` file count.
- Total = union of 5 sources (.block-ready, docs/blocks program, docs/accounting, docs/dispatch enterprise-29, docs/specs gap), de-duped by id. So the block count is NOT the .block-ready file count.
- **`.block-ready/*.json` files on disk:** 305
- **By source (after de-dup):** .block-ready: 294 · program: 61 · enterprise-29: 29 · accounting: 26 · gap-spec: 57

## Delta — blocks added since 2026-06-16 (today's work, now counted)
Blocks whose `.block-ready` file carries `"added" >= 2026-06-16`. If empty, no new blocks were registered.
| Block | Status | PR | Title |
|-------|--------|----|-------|
| DOC-CATALOGS-ACCOUNTS-FK-INVENTORY | DONE | #1518 | Authoritative FK re-key inventory for catalogs.accounts (29 cols/20 tables) — AF-1 input. |
| DOC-CATALOGS-CLASSES-FK-INVENTORY | DONE | #1519 | catalogs.classes per-entity FK inventory — companion to AF-1. |
| FIX-DISPATCH-DRIVER-PICKER-50-CAP | DONE | #1530 | Book Load driver picker 50-cap — load full active set (limit:200) so drivers past newest 50 appear (Mecor). Also #1529 i |
| FIX-DRIVERS-FULL-NAME-PHANTOM | DONE | #1534 | mdata.drivers.full_name phantom across 5 endpoints (42703) → CONCAT_WS(first,last); +db-test guard. |
| FIX-LEGAL-FLEET-VEHICLE-TYPE-PHANTOM | DONE | #1520 | Legal lease-to-own /fleet 500 — phantom u.unit_type → vehicle_type. |
| FIX-MAINTENANCE-SERVICES-ETA-PHANTOM | DONE | #1532 | services/eta 500 — 3 phantom mdata.units cols → telematics.vehicle_latest_position + maintenance.pm_schedules. |
| FIX-PER-TRUCK-CPM-PERMITS-CTE | DONE | #1517 | per-truck-cpm permits CTE 500 fix — repoint phantom CTE to the real unit relation; +static CI guard. |
| FIX-PICKERS-50-CAP-UNITS-VENDORS-CUSTOMERS | DONE | #1533 | 50-cap class — unit/vendor/customer client pickers load full active set (limit forwarded in mdata.ts). |
| QBO-SYNC-DRIFT-401-FIX | PENDING |  | QBO Sync Drift dashboard 401 — data calls send session cookie via apiRequest (was raw fetch). |
| TBL-STANDARD-INSURANCE-POLICIES | DONE | #1531 | TBL-STANDARD surface 1 — migrate Insurance Policies list to the shared DataTable. |
| UNIFIED-TXN-REGISTER | PENDING |  | Unified Transaction Register — bank+fuel+AR+AP+settlement in one read-only entity-scoped register. |

## Every block
| Block | Status | Fin | Tier | PR | Source | Evidence |
|-------|--------|-----|------|----|--------|----------|
| CASH-FLOW-MODULE | PENDING |  |  |  | .block-ready | no merged PR / no files on main |
| QBO-SYNC-DRIFT-401-FIX | PENDING |  |  |  | .block-ready | no merged PR / no files on main |
| TBL-STANDARD-universal-table-sweep | PENDING |  | T2 |  | program | forward spec — 0 named artifacts on main |
| UNIFIED-TXN-REGISTER | PENDING |  |  |  | .block-ready | 0/2 signature file(s) on main |
| BLOCK-01-of-29-TIER1.5-DEPRECIATION | PENDING (GATED) |  | T1.5 |  | enterprise-29 | deep-verified 2026-06-24 (feature grep) |
| BLOCK-02-of-29-TIER1.5-DRIVER-ESCROW | PENDING (GATED) |  | T1.5 |  | enterprise-29 | deep-verified 2026-06-24 (feature grep) |
| BLOCK-03-of-29-TIER1.5-IFTA | PENDING (GATED) |  | T1.5 |  | enterprise-29 | deep-verified 2026-06-24 (feature grep) |
| BLOCK-17-of-29-TIER2.5-W2-1099 | PENDING (GATED) |  | T2.5 |  | enterprise-29 | deep-verified 2026-06-24 (feature grep) |
| BLOCK-19-of-29-TIER3-AUDIT-HASH | PENDING (GATED) |  | T3 |  | enterprise-29 | deep-verified 2026-06-24 (feature grep) |
| BLOCK-24-of-29-TIER3.5-1099-ANNUAL | PENDING (GATED) |  | T3.5 |  | enterprise-29 | deep-verified 2026-06-24 (feature grep) |
| BLOCK-25-of-29-TIER3.5-CONSOLIDATION | PENDING (GATED) |  | T3.5 |  | enterprise-29 | deep-verified 2026-06-24 (feature grep) |
| CHAIN-08-transp-demo-data-purge | PENDING (GATED) | 💰 | T1 |  | program | forward spec — 0 named artifacts on main |
| CONN-1-plaid-reconcile-commit | PENDING (GATED) | 💰 | T1 |  | program | forward spec — 0 named artifacts on main |
| CONN-2-factoring-faro | PENDING (GATED) | 💰 |  |  | program | forward spec — 0 named artifacts on main |
| CONN-3-relay-internal-bank | PENDING (GATED) | 💰 | T1 |  | program | forward spec — 0 named artifacts on main |
| CONN-4-edi-foundation | PENDING (GATED) | 💰 | T2 |  | program | forward spec — 0 named artifacts on main |
| DISP-WIZARD-edit-load-patch | PENDING (GATED) |  | T2 |  | program | BUILD / GATED (HELD). Tier 2 (load edit) → Tier 1 if it touches billing/settlement. |
| DISP-WO-work-order-modal | PENDING (GATED) |  | T2 |  | program | LIVE-TRACED / BUILD. Tier 2 (build modal) — posting (create_bill_for_wo) Tier 1, STOPS for |
| ENT-AUDIT | PENDING (GATED) |  | T1 |  | program | VERIFY-STATE / BUILD. Tier per scope (any GL posting = Tier 1, STOPS for Jorge). |
| FH-VERIFY-finance-hub-modules | PENDING (GATED) | 💰 | T1 |  | program | forward spec — 0 named artifacts on main |
| HOS-FANOUT-03-08 | PENDING (GATED) |  | T2 |  | program | GATED / VERIFY-STATE. Tier 2. |
| HOS-MAP-driver-samsara-id | PENDING (GATED) |  | T2 |  | program | LIVE-TRACED / BUILD. Tier 2 (telematics) + MIGRATE if a backfill writes ids. STOPS for Jor |
| HOS-PRC-DATA-verbatim-clocks | PENDING (GATED) |  | T2 |  | program | LIVE-TRACED / GATED. Tier 2 (telematics, no money). |
| HOS-PRC2-reader-swap | PENDING (GATED) |  | T2 |  | program | GATED on GUARD per-driver verify (board == roster == Samsara certified ELD). Tier 2. |
| STMT-2-opening-balances | PENDING (GATED) | 💰 | T1 |  | program | forward spec — 0 named artifacts on main |
| STMT-3-1099-425c-consolidation | PENDING (GATED) | 💰 | T2 |  | program | forward spec — 0 named artifacts on main |
| USMCA-LAUNCH-carrier | PENDING (GATED) |  | T1 |  | program | GATED (launch July 2026). Tier 1 (new entity going live). STOPS for Jorge. |
| VOID-VERIFY-void-everywhere | PENDING (GATED) | 💰 | T1 |  | program | forward spec — 0 named artifacts on main |
| AF-0-rebaseline | NEEDS-VERIFY | 💰 | T3 | #1264 | program | PR #1264 title-match only, unverified |
| AF-1-entity-coa-fix | NEEDS-VERIFY | 💰 | T1 | #530 | program | PR #530 title-match only, unverified |
| AF-2-qbo-drift | NEEDS-VERIFY | 💰 | T1 | #532 | program | PR #532 title-match only, unverified |
| AF-3-account-registers | NEEDS-VERIFY | 💰 | T2 | #534 | program | PR #534 title-match only, unverified |
| AF-4-ap-bills-migration | NEEDS-VERIFY | 💰 | T1 | #536 | program | PR #536 title-match only, unverified |
| AF-5-stub-catalogs | NEEDS-VERIFY | 💰 | T2 | #538 | program | PR #538 title-match only, unverified |
| AF-6-finance-hub | NEEDS-VERIFY | 💰 | T2 | #540 | program | PR #540 title-match only, unverified |
| AF-7-money-controls | NEEDS-VERIFY | 💰 | T1 | #542 | program | PR #542 title-match only, unverified |
| AF-8-payroll-bridge | NEEDS-VERIFY | 💰 | T1 | #544 | program | PR #544 title-match only, unverified |
| block-37-qbo-sync-repair-pipeline | NEEDS-VERIFY | 💰 |  | #226 | accounting | PR #226 title-match only, unverified |
| block-40-accounting-audit-trail | NEEDS-VERIFY | 💰 |  | #227 | accounting | PR #227 title-match only, unverified |
| CHAIN-01-vendor-picker-fix | NEEDS-VERIFY | 💰 | T2 | #1262 | program | PR #1262 title-match only, unverified |
| CHAIN-02-account-register-params | NEEDS-VERIFY | 💰 |  | #1263 | program | PR #1263 title-match only, unverified |
| CHAIN-03-create-bill-gl-autopost | NEEDS-VERIFY | 💰 | T1 | #1300 | program | PR #1300 title-match only, unverified |
| CHAIN-04-bill-payment-tieout | NEEDS-VERIFY | 💰 | T1 | #1267 | program | PR #1267 title-match only, unverified |
| CHAIN-05-bank-feed-live-proof | NEEDS-VERIFY | 💰 | T1 | #1268 | program | PR #1268 title-match only, unverified |
| CHAIN-06-invoice-ar-chain-proof | NEEDS-VERIFY | 💰 | T1 | #1269 | program | PR #1269 title-match only, unverified |
| CHAIN-07-settlements-500-fix | NEEDS-VERIFY | 💰 | T1 | #1270 | program | PR #1270 title-match only, unverified |
| STMT-1-balance-sheet-cash-flow | NEEDS-VERIFY | 💰 | T2 | #1265 | program | PR #1265 title-match only, unverified |
| A1-AUDIT-SPINE-LINK-COLUMNS | DONE | 💰 |  | #884 | .block-ready | PR #884 merged 2026-06-11 |
| A2-AUDIT-EMIT-DISPATCH | DONE |  |  | #886 | .block-ready | PR #886 merged 2026-06-12 |
| A3-AUDIT-EMIT-MAINTENANCE | DONE |  |  | #888 | .block-ready | PR #888 merged 2026-06-12 |
| A4-AUDIT-EMIT-ACCOUNTING | DONE |  |  | #889 | .block-ready | PR #889 merged 2026-06-12 |
| A5-AUDIT-EMIT-BANKING | DONE |  |  | #890 | .block-ready | PR #890 merged 2026-06-12 |
| A6-AUDIT-UNIVERSAL-VIEW | DONE |  |  | #891 | .block-ready | PR #891 merged 2026-06-12 |
| A7-AUDIT-PER-ENTITY-TABS | DONE |  |  | #909 | .block-ready | PR #909 merged 2026-06-12 |
| A8-AUDIT-REPORTS-SECTION | DONE |  |  | #899 | .block-ready | PR #899 merged 2026-06-12 |
| A9-AUDIT-CI-EMIT-GUARD | DONE |  |  | #901 | .block-ready | PR #901 merged 2026-06-12 |
| ACCT-BLOCK-10-ACCOUNT-BALANCES | DONE |  |  | #709 | .block-ready | PR #709 merged 2026-06-08 |
| ACCT-BLOCK-11-PERIODS-INIT | DONE |  |  | #814 | .block-ready | PR #814 merged 2026-06-09 |
| ACCT-COA-CANONICALIZATION | DONE |  |  | #715 | .block-ready | PR #715 merged 2026-06-08 |
| ACCT-INTEGRITY-VERIFY-EXTEND | DONE |  |  | #816 | .block-ready | PR #816 merged 2026-06-09 |
| ACCT-QBOPAR-00-DESIGN-LOCK | DONE |  |  | #703 | .block-ready | PR #703 merged 2026-06-07 |
| ACCT-QBOPAR-01-CATALOG-BACKEND | DONE |  |  |  | .block-ready | all 16 file(s) on main |
| ACCT-QBOPAR-02 | DONE |  |  | #710 | .block-ready | PR #710 merged 2026-06-07 |
| ACCT-QBOPAR-03 | DONE |  |  | #740 | .block-ready | PR #740 merged 2026-06-08 |
| ACCT-QBOPAR-04 | DONE |  |  | #815 | .block-ready | PR #815 merged 2026-06-08 |
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
| block-22-driver-settlement-engine | DONE | 💰 |  |  | accounting | all 4 named artifact(s) on main |
| BLOCK-22-of-29-TIER3-OPS-RUNBOOKS | DONE |  | T3 |  | enterprise-29 | all 1 named artifact(s) on main |
| block-23-escrow-posting-flow | DONE | 💰 |  |  | accounting | all 1 named artifact(s) on main |
| BLOCK-23-of-29-TIER3-DEGRADATION | DONE |  | T3 |  | enterprise-29 | all 1 named artifact(s) on main |
| block-24-factoring-posting | DONE | 💰 |  |  | accounting | all 4 named artifact(s) on main |
| block-25-factoring-fees-reserves | DONE | 💰 |  |  | accounting | all 6 named artifact(s) on main |
| block-26-factoring-reconciliation | DONE | 💰 |  |  | accounting | all 10 named artifact(s) on main |
| BLOCK-26-of-29-TIER4-PARTITION | DONE |  | T4 |  | enterprise-29 | all 1 named artifact(s) on main |
| block-27-fuel-expense-posting | DONE | 💰 |  | #203 | accounting | branch feat/block-27-fuel-expense-posting → PR #203 merged 2026-05-23 |
| BLOCK-27-of-29-TIER4-CANARY | DONE |  | T4 |  | enterprise-29 | all 1 named artifact(s) on main |
| block-28-maintenance-ap-posting | DONE | 💰 |  | #205 | accounting | branch feat/block-28-maintenance-ap-posting → PR #205 merged 2026-05-23 |
| BLOCK-28-of-29-TIER4-VENDOR-LOCKIN | DONE |  | T4 |  | enterprise-29 | all 1 named artifact(s) on main |
| block-29-bank-reconciliation-engine | DONE | 💰 |  | #206 | accounting | branch feat/block-29-bank-reconciliation-engine → PR #206 merged 2026-05-23 |
| BLOCK-29-of-29-TIER4-KNOWN-LIMITATIONS | DONE |  | T4 |  | enterprise-29 | all 1 named artifact(s) on main |
| block-30-bank-reconciliation-ui | DONE | 💰 |  |  | accounting | all 10 named artifact(s) on main |
| block-31-sales-tax-handling | DONE | 💰 |  |  | accounting | all 10 named artifact(s) on main |
| block-33-invoice-line-revenue-mapping | DONE | 💰 |  | #209 | accounting | branch feat/block-33-invoice-line-revenue-mapping → PR #209 merged 2026-05-23 |
| block-34-payment-application | DONE | 💰 |  |  | accounting | all 7 named artifact(s) on main |
| block-35-chart-of-accounts-roles | DONE | 💰 |  |  | accounting | all 6 named artifact(s) on main |
| block-36-multi-entity-accounting | DONE | 💰 |  |  | accounting | all 9 named artifact(s) on main |
| block-41-posting-lineage-ui | DONE | 💰 |  |  | accounting | all 5 named artifact(s) on main |
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
| BLOCK-I-CI-DIST-FIX | DONE |  |  | #73 | .block-ready | all 1 file(s) on main |
| BLOCK-J-MASTER-DATA-GRANT | DONE |  |  | #1063 | .block-ready | all 2 file(s) on main |
| block-ppc-period-comparison | DONE | 💰 |  |  | accounting | all 1 named artifact(s) on main |
| BLOCK5-INSURANCE-FORWARD-FIX | DONE |  |  | #695 | .block-ready | PR #695 merged 2026-06-07 |
| BLOCK7-DRIVER-HUB-REQUESTS | DONE |  |  | #694 | .block-ready | PR #694 merged 2026-06-07 |
| BUG-ADD-USER-INERT | DONE |  |  | #861 | .block-ready | PR #861 merged 2026-06-10 |
| C1-PRE-SETTLEMENTS | DONE |  |  | #900 | .block-ready | PR #900 merged 2026-06-12 |
| C2-FACTORING-PROFILE | DONE |  |  | #904 | .block-ready | PR #904 merged 2026-06-12 |
| C3-CUSTOMER-CONTRACT-UPLOAD | DONE |  |  | #902 | .block-ready | PR #902 merged 2026-06-12 |
| C4-CUST-VEND-REBUILD-RECLASSIFY | DONE |  |  | #905 | .block-ready | PR #905 merged 2026-06-12 |
| C6-HOME-DASHBOARD | DONE | 💰 |  |  | .block-ready | all 3 file(s) on main |
| C7-ACCT-SUBNAV-CHROME | DONE | 💰 |  |  | .block-ready | all 10 file(s) on main |
| CAP-AUTOSTATUS | DONE |  |  |  | program | all 1 named artifact(s) on main |
| CAP-CARGOTEMP | DONE |  |  |  | program | all 2 named artifact(s) on main |
| CAP-ENGINEWO | DONE |  |  |  | program | all 2 named artifact(s) on main |
| CAP-FUELFRAUD | DONE |  |  |  | program | all 1 named artifact(s) on main |
| CAP-GPS | DONE |  |  |  | program | all 3 named artifact(s) on main |
| CAP-PREDICTIVE | DONE |  |  |  | program | all 2 named artifact(s) on main |
| CAP-SCORING | DONE |  |  |  | program | all 2 named artifact(s) on main |
| CHORE-MASTER-TRACKER-MD | DONE | 💰 |  | #924 | .block-ready | PR #924 merged 2026-06-13 |
| CHORE-UNVERIFIED-ROWS-RECONCILE | DONE | 💰 |  | #928 | .block-ready | PR #928 merged 2026-06-13 |
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
| D1-SETTLEMENTS-APPROVAL-PDF | DONE |  |  | #910 | .block-ready | PR #910 merged 2026-06-12 |
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
| E1-SMOKE-SERVICE-TOKEN-AUTH | DONE |  |  | #906 | .block-ready | PR #906 merged 2026-06-12 |
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
| FEAT-SIDEBAR-V2-REORG-25 | DONE |  |  | #859 | .block-ready | PR #859 merged 2026-06-10 |
| FEAT-TASK-BOARD-CREATE-TASK-UI | DONE |  |  | #940 | .block-ready | PR #940 merged 2026-06-14 |
| FEAT-TRACKER-EXPORT-GITHUB-TABS | DONE |  |  | #941 | .block-ready | PR #941 merged 2026-06-14 |
| FEAT-V0-SIDEBAR-DRIVER-HUB | DONE |  |  | #827 | .block-ready | PR #827 merged 2026-06-09 |
| FEAT-V2-A2-REFERENCE-SELECT | DONE |  |  | #828 | .block-ready | PR #828 merged 2026-06-09 |
| FEAT-VOID-EVERYWHERE-PR1 | DONE | 💰 |  | #973 | .block-ready | PR #973 merged 2026-06-15 |
| FEAT-VOID-EVERYWHERE-PR2 | DONE | 💰 |  | #977 | .block-ready | PR #977 merged 2026-06-15 |
| FIX-AT-RISK-LOADS-SD-CITY | DONE |  |  | #820 | .block-ready | PR #820 merged 2026-06-08 |
| FIX-AUDIT-KPI-DRIFTS | DONE |  |  | #480 | .block-ready | PR #480 merged 2026-06-04 |
| FIX-AUDIT-NESTED-MODALS | DONE |  |  | #462 | .block-ready | PR #462 merged 2026-06-04 |
| FIX-AUDIT-PROD-STUBS | DONE |  |  | #471 | .block-ready | PR #471 merged 2026-06-04 |
| FIX-AUDIT-TEST-DATA-LEAK | DONE |  |  | #469 | .block-ready | PR #469 merged 2026-06-04 |
| FIX-AUDIT-TRIGGER-DRIFT | DONE |  |  |  | .block-ready | all 1 file(s) on main |
| FIX-CANARY-SMOKE-DURABLE | DONE |  |  |  | .block-ready | all 1 file(s) on main |
| FIX-CI-YML-CONFLICT-MARKERS | DONE | 💰 |  | #875 | .block-ready | PR #875 merged 2026-06-11 |
| FIX-COA-UNCATEGORIZED-EXPENSE-QBO-RECONCILE | DONE | 💰 |  | #1019 | .block-ready | PR #1019 merged 2026-06-15 |
| FIX-DEPLOY-MIGRATION-DRIFT | DONE | 💰 |  | #878 | .block-ready | PR #878 merged 2026-06-11 |
| FIX-DISPATCH-DRIVER-PICKER-50-CAP | DONE |  |  | #1530 | .block-ready | PR #1530 merged 2026-06-27 |
| FIX-DISPATCH-SUBNAV-ROUTING | DONE |  |  | #818 | .block-ready | PR #818 merged 2026-06-08 |
| FIX-DOUBLE-STRINGIFY-SWEEP-NONMONEY | DONE |  |  | #975 | .block-ready | PR #975 merged 2026-06-15 |
| FIX-DRIVERS-FULL-NAME-PHANTOM | DONE |  |  | #1534 | .block-ready | PR #1534 merged 2026-06-27 |
| FIX-FINANCE-DOUBLE-STRINGIFY-SWEEP | DONE |  |  | #971 | .block-ready | PR #971 merged 2026-06-15 |
| FIX-FUEL-SUBNAV-ROUTING | DONE |  |  | #817 | .block-ready | PR #817 merged 2026-06-08 |
| FIX-GUARD-M2-FK-DETECTION | DONE |  |  | #917 | .block-ready | PR #917 merged 2026-06-13 |
| FIX-INSURANCE-POLICY-UNIT-IS-ACTIVE | DONE | 💰 |  | #1011 | .block-ready | PR #1011 merged 2026-06-15 |
| FIX-LEGAL-FLEET-VEHICLE-TYPE-PHANTOM | DONE |  |  | #1520 | .block-ready | PR #1520 merged 2026-06-26 |
| FIX-MAINTENANCE-SERVICES-ETA-PHANTOM | DONE |  |  | #1532 | .block-ready | PR #1532 merged 2026-06-27 |
| FIX-P8-AUDIT-NESTED-MODALS | DONE |  |  | #907 | .block-ready | PR #907 merged 2026-06-12 |
| FIX-PER-TRUCK-CPM-PERMITS-CTE | DONE |  |  | #1517 | .block-ready | PR #1517 merged 2026-06-26 |
| FIX-PICKERS-50-CAP-UNITS-VENDORS-CUSTOMERS | DONE |  |  | #1533 | .block-ready | PR #1533 merged 2026-06-27 |
| FIX-REMOVE-LEFT-SIDEBAR-HOVER-DROPDOWN | DONE |  |  | #974 | .block-ready | PR #974 merged 2026-06-15 |
| FIX-REQUIRED-CHECKS-GATE | DONE |  |  |  | .block-ready | all 1 file(s) on main |
| FIX-RLS-BILL-EXPENSE-LINES | DONE |  |  | #714 | .block-ready | PR #714 merged 2026-06-08 |
| FIX-SAFETY-NAV-COUNT | DONE |  |  | #647 | .block-ready | PR #647 merged 2026-06-07 |
| FIX-SAMSARA-WEBHOOKS-INVESTIGATION | DONE |  |  | #475 | .block-ready | PR #475 merged 2026-06-04 |
| FIX-STEP3-POSTING-BALANCED-JE-PROOF | DONE | 💰 |  | #1021 | .block-ready | PR #1021 merged 2026-06-15 |
| FIX-TASK-CREATE-DOUBLE-STRINGIFY | DONE |  |  | #970 | .block-ready | PR #970 merged 2026-06-15 |
| FIX-TEST-JSDOM-ENV-MISSING | DONE |  |  | #863 | .block-ready | PR #863 merged 2026-06-10 |
| FIX-URL-NORMALIZE | DONE |  |  | #819 | .block-ready | PR #819 merged 2026-06-08 |
| FOLLOWUP-SPECS-2026-06-07 | DONE |  |  | #689 | .block-ready | PR #689 merged 2026-06-07 |
| GAP-10-DELTA-CANCELLATIONS-REPORT | DONE |  |  | #663 | .block-ready | PR #663 merged 2026-06-07 |
| GAP-11-DELTA-UPLOAD-EXPENSE | DONE |  |  | #666 | .block-ready | PR #666 merged 2026-06-07 |
| GAP-14-PRE-DISPATCH-VALIDATION | DONE |  |  | #1150 | .block-ready | all 6 file(s) on main |
| gap-14-validation-pre-dispatch | DONE |  |  |  | gap-spec | all 6 named artifact(s) on main |
| GAP-18-DRIVER-COMM-TIMELINE | DONE |  |  | #682 | .block-ready | PR #682 merged 2026-06-07 |
| GAP-19-DETENTION-INVOICE | DONE |  |  | #686 | .block-ready | PR #686 merged 2026-06-07 |
| GAP-20 | DONE |  |  | #704 | .block-ready | PR #704 merged 2026-06-07 |
| gap-20-recurring-bills | DONE |  |  |  | gap-spec | all 2 named artifact(s) on main |
| GAP-23 | DONE |  |  | #662 | .block-ready | PR #662 merged 2026-06-07 |
| gap-23-samsara-cache-tiers | DONE |  |  |  | gap-spec | all 2 named artifact(s) on main |
| GAP-24-FRESHNESS-INDICATOR | DONE |  |  | #685 | .block-ready | PR #685 merged 2026-06-07 |
| GAP-25 | DONE |  |  | #707 | .block-ready | PR #707 merged 2026-06-08 |
| gap-25-active-driver-set | DONE |  |  |  | gap-spec | all 3 named artifact(s) on main |
| GAP-26 | DONE |  |  | #722 | .block-ready | PR #722 merged 2026-06-08 |
| gap-26-border-crossings | DONE |  |  |  | gap-spec | all 2 named artifact(s) on main |
| GAP-27 | DONE |  |  | #724 | .block-ready | PR #724 merged 2026-06-08 |
| gap-27-geofence-reconciliation | DONE |  |  |  | gap-spec | all 2 named artifact(s) on main |
| GAP-28 | DONE |  |  | #726 | .block-ready | all 8 file(s) on main |
| gap-28-layover-detection | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-29 | DONE |  |  | #729 | .block-ready | all 7 file(s) on main |
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
| GAP-66-DISPATCHER-HOME | DONE |  |  | #645 | .block-ready | PR #645 merged 2026-06-07 |
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
| GAP-82-MEDICAL-CARD-TRACKING | DONE |  |  | #640 | .block-ready | PR #640 merged 2026-06-07 |
| gap-83-eld-audit-trail | DONE |  |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-83-ELD-AUDIT-VIEWER | DONE |  |  | #644 | .block-ready | PR #644 merged 2026-06-07 |
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
| HOS-BUG-DRIVERASSIGN | DONE |  | T2 |  | program | all 2 named artifact(s) on main |
| HOS-VIEWER-DONE | DONE |  |  |  | program | all 3 named artifact(s) on main |
| HOTFIX-0327-MIGRATION-ROLE | DONE |  |  | #643 | .block-ready | PR #643 merged 2026-06-07 |
| INS-MODULE | DONE |  |  |  | program | all 3 named artifact(s) on main |
| ITEM1-TWO-SIDED-ITEM | DONE | 💰 |  | #867 | .block-ready | all 2 file(s) on main |
| LOCKDOWN-ENFORCEMENT-GUARDS | DONE |  |  | #755 | .block-ready | PR #755 merged 2026-06-08 |
| M1-POSITIONED-PARTS | DONE |  |  | #913 | .block-ready | PR #913 merged 2026-06-12 |
| M2-INTEGRITY-POSITION-HISTORY | DONE |  |  | #915 | .block-ready | PR #915 merged 2026-06-13 |
| MIGRATION-RUNNER-HARDEN | DONE |  |  | #914 | .block-ready | PR #914 merged 2026-06-13 |
| MNT-SHOP | DONE |  |  |  | program | all 3 named artifact(s) on main |
| MX-OPS | DONE |  |  |  | program | all 3 named artifact(s) on main |
| OB1-NAV-HEADER-UNIFY | DONE |  |  | #894 | .block-ready | PR #894 merged 2026-06-12 |
| P0-BLOCK-3-DRIVER-LOAD-HISTORY | DONE |  |  | #731 | .block-ready | PR #731 merged 2026-06-08 |
| P5-T6-BANKING-TRANSFER | DONE |  |  | #862 | .block-ready | PR #862 merged 2026-06-10 |
| PREREQ-A-SCHEMA-GRANT-GATE | DONE |  |  | #684 | .block-ready | all 1 file(s) on main |
| PREREQ-B-SETTLEMENT-DEDUCTION-SVC | DONE |  |  | #683 | .block-ready | PR #683 merged 2026-06-07 |
| Q9-TZ-timezone-library | DONE |  | T2 |  | program | all 1 named artifact(s) on main |
| RPT-MODULE | DONE |  |  |  | program | all 3 named artifact(s) on main |
| SAFE-W3 | DONE |  |  |  | program | all 3 named artifact(s) on main |
| SAFE-W4 | DONE |  |  |  | program | all 3 named artifact(s) on main |
| SAFE-W5 | DONE |  |  |  | program | all 3 named artifact(s) on main |
| SETTLEMENTS-SIDEBAR-RENAME-MOVE | DONE |  |  | #893 | .block-ready | PR #893 merged 2026-06-12 |
| SHADOW-ROUTE-REDIRECTS | DONE |  |  | #887 | .block-ready | PR #887 merged 2026-06-12 |
| SIDEBAR-DRIVER-HUB | DONE |  |  | #680 | .block-ready | PR #680 merged 2026-06-07 |
| SIDEBAR-INSURANCE | DONE |  |  | #717 | .block-ready | PR #717 merged 2026-06-08 |
| SMOKE-TOKEN-AUTH | DONE |  |  | #860 | .block-ready | PR #860 merged 2026-06-10 |
| STRUCTURAL-MANIFEST-SPLIT | DONE |  |  | #650 | .block-ready | PR #650 merged 2026-06-07 |
| STRUCTURAL-MIGRATION-TIMESTAMPS | DONE |  |  | #648 | .block-ready | PR #648 merged 2026-06-07 |
| TASKS-PLANNER-REDESIGN-V3 | DONE |  |  | #892 | .block-ready | PR #892 merged 2026-06-12 |
| TBL-STANDARD-INSURANCE-POLICIES | DONE |  |  | #1531 | .block-ready | PR #1531 merged 2026-06-27 |
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
| UX-A-table-alignment-DONE | DONE |  |  |  | program | all 1 named artifact(s) on main |
| UX-B-dispatch-location-column | DONE |  | T2 |  | program | all 1 named artifact(s) on main |
| UX-C-fleet-location | DONE |  | T2 |  | program | all 2 named artifact(s) on main |
| UX-D-hos-cycle-drawer | DONE |  | T2 |  | program | all 1 named artifact(s) on main |
| UX-E-compliance-hos-location | DONE |  | T2 |  | program | all 1 named artifact(s) on main |
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
