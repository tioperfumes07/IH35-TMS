# BLOCK RECONCILIATION — 2026-06-26 (every block, built vs pending — verified)

**DONE** = verified on main (branch merged or all signature files present).  **NEEDS-VERIFY** = weak signal (title-match / partial files / self-report), not trusted until GUARD confirms.  **PENDING** = needs build.  **PENDING (GATED)** = financial/locked, needs Jorge's gate first.

**Verified against `origin/main` (7059 files) + 1441 merged PRs.** A block is **DONE only if its branch merged OR all its signature files are present on main** — those are the only evidence. Weak signals (PR-title token match, partial files, a doc's own "shipped/done" self-report, a prior hardcoded built-claim) are **NEEDS-VERIFY** — not trusted until GUARD confirms. Nothing reads as DONE that wasn't really verified.

## Counts
- **PENDING**: 6
- **PENDING (GATED)**: 24
- **NEEDS-VERIFY**: 29
- **DONE**: 397

## Every block
| Block | Status | Fin | Tier | Source | Evidence |
|-------|--------|-----|------|--------|----------|
| BLOCK-18-of-29-TIER3-PII-ENCRYPTION | PENDING |  | T3 | enterprise-29 | deep-verified 2026-06-24 (feature grep) |
| CASH-FLOW-MODULE | PENDING |  |  | .block-ready | no merged PR / no files on main |
| FIX-AUDIT-TRIGGER-DRIFT | PENDING |  |  | .block-ready | no merged PR / no files on main |
| FIX-REQUIRED-CHECKS-GATE | PENDING |  |  | .block-ready | no merged PR / no files on main |
| HOS-BUG-DRIVERASSIGN | PENDING |  | T2 | program | forward spec — 0 named artifacts on main |
| TBL-STANDARD-universal-table-sweep | PENDING |  | T2 | program | forward spec — 0 named artifacts on main |
| BLOCK-01-of-29-TIER1.5-DEPRECIATION | PENDING (GATED) |  | T1.5 | enterprise-29 | deep-verified 2026-06-24 (feature grep) |
| BLOCK-02-of-29-TIER1.5-DRIVER-ESCROW | PENDING (GATED) |  | T1.5 | enterprise-29 | deep-verified 2026-06-24 (feature grep) |
| BLOCK-03-of-29-TIER1.5-IFTA | PENDING (GATED) |  | T1.5 | enterprise-29 | deep-verified 2026-06-24 (feature grep) |
| BLOCK-17-of-29-TIER2.5-W2-1099 | PENDING (GATED) |  | T2.5 | enterprise-29 | deep-verified 2026-06-24 (feature grep) |
| BLOCK-19-of-29-TIER3-AUDIT-HASH | PENDING (GATED) |  | T3 | enterprise-29 | deep-verified 2026-06-24 (feature grep) |
| BLOCK-24-of-29-TIER3.5-1099-ANNUAL | PENDING (GATED) |  | T3.5 | enterprise-29 | deep-verified 2026-06-24 (feature grep) |
| BLOCK-25-of-29-TIER3.5-CONSOLIDATION | PENDING (GATED) |  | T3.5 | enterprise-29 | deep-verified 2026-06-24 (feature grep) |
| CHAIN-08-transp-demo-data-purge | PENDING (GATED) | 💰 | T1 | program | forward spec — 0 named artifacts on main |
| CONN-1-plaid-reconcile-commit | PENDING (GATED) | 💰 | T1 | program | forward spec — 0 named artifacts on main |
| CONN-2-factoring-faro | PENDING (GATED) | 💰 |  | program | forward spec — 0 named artifacts on main |
| CONN-3-relay-internal-bank | PENDING (GATED) | 💰 | T1 | program | forward spec — 0 named artifacts on main |
| CONN-4-edi-foundation | PENDING (GATED) | 💰 | T2 | program | forward spec — 0 named artifacts on main |
| DISP-WIZARD-edit-load-patch | PENDING (GATED) |  | T2 | program | BUILD / GATED (HELD). Tier 2 (load edit) → Tier 1 if it touches billing/settlement. |
| DISP-WO-work-order-modal | PENDING (GATED) |  | T2 | program | LIVE-TRACED / BUILD. Tier 2 (build modal) — posting (create_bill_for_wo) Tier 1, STOPS for |
| ENT-AUDIT | PENDING (GATED) |  | T1 | program | VERIFY-STATE / BUILD. Tier per scope (any GL posting = Tier 1, STOPS for Jorge). |
| FH-VERIFY-finance-hub-modules | PENDING (GATED) | 💰 | T1 | program | forward spec — 0 named artifacts on main |
| HOS-FANOUT-03-08 | PENDING (GATED) |  | T2 | program | GATED / VERIFY-STATE. Tier 2. |
| HOS-MAP-driver-samsara-id | PENDING (GATED) |  | T2 | program | LIVE-TRACED / BUILD. Tier 2 (telematics) + MIGRATE if a backfill writes ids. STOPS for Jor |
| HOS-PRC-DATA-verbatim-clocks | PENDING (GATED) |  | T2 | program | LIVE-TRACED / GATED. Tier 2 (telematics, no money). |
| HOS-PRC2-reader-swap | PENDING (GATED) |  | T2 | program | GATED on GUARD per-driver verify (board == roster == Samsara certified ELD). Tier 2. |
| STMT-2-opening-balances | PENDING (GATED) | 💰 | T1 | program | forward spec — 0 named artifacts on main |
| STMT-3-1099-425c-consolidation | PENDING (GATED) | 💰 | T2 | program | forward spec — 0 named artifacts on main |
| USMCA-LAUNCH-carrier | PENDING (GATED) |  | T1 | program | GATED (launch July 2026). Tier 1 (new entity going live). STOPS for Jorge. |
| VOID-VERIFY-void-everywhere | PENDING (GATED) | 💰 | T1 | program | forward spec — 0 named artifacts on main |
| AF-0-rebaseline | NEEDS-VERIFY | 💰 | T3 | program | PR #1264 title-match only, unverified |
| AF-1-entity-coa-fix | NEEDS-VERIFY | 💰 | T1 | program | PR #530 title-match only, unverified |
| AF-2-qbo-drift | NEEDS-VERIFY | 💰 | T1 | program | PR #532 title-match only, unverified |
| AF-3-account-registers | NEEDS-VERIFY | 💰 | T2 | program | PR #534 title-match only, unverified |
| AF-4-ap-bills-migration | NEEDS-VERIFY | 💰 | T1 | program | PR #536 title-match only, unverified |
| AF-5-stub-catalogs | NEEDS-VERIFY | 💰 | T2 | program | PR #538 title-match only, unverified |
| AF-6-finance-hub | NEEDS-VERIFY | 💰 | T2 | program | PR #540 title-match only, unverified |
| AF-7-money-controls | NEEDS-VERIFY | 💰 | T1 | program | PR #542 title-match only, unverified |
| AF-8-payroll-bridge | NEEDS-VERIFY | 💰 | T1 | program | PR #544 title-match only, unverified |
| BK7-INLINE-CREATE-DRAWERS | NEEDS-VERIFY |  |  | .block-ready | PR #866 title-match only, unverified |
| BLOCK-09-of-29-TIER2-E2E-PATHS | NEEDS-VERIFY |  | T2 | enterprise-29 | PR #802 title-match only, unverified |
| BLOCK-20-of-29-TIER3-SECRETS-ROTATION | NEEDS-VERIFY |  | T3 | enterprise-29 | PR #806 title-match only, unverified |
| BLOCK-23-of-29-TIER3-DEGRADATION | NEEDS-VERIFY |  | T3 | enterprise-29 | PR #808 title-match only, unverified |
| BLOCK-26-of-29-TIER4-PARTITION | NEEDS-VERIFY |  | T4 | enterprise-29 | PR #809 title-match only, unverified |
| BLOCK-28-of-29-TIER4-VENDOR-LOCKIN | NEEDS-VERIFY |  | T4 | enterprise-29 | PR #811 title-match only, unverified |
| BLOCK-29-of-29-TIER4-KNOWN-LIMITATIONS | NEEDS-VERIFY |  | T4 | enterprise-29 | PR #813 title-match only, unverified |
| block-37-qbo-sync-repair-pipeline | NEEDS-VERIFY | 💰 |  | accounting | PR #226 title-match only, unverified |
| block-40-accounting-audit-trail | NEEDS-VERIFY | 💰 |  | accounting | PR #227 title-match only, unverified |
| BLOCK-I-CI-DIST-FIX | NEEDS-VERIFY |  |  | .block-ready | PR #73 title-match only, unverified |
| BLOCK-J-MASTER-DATA-GRANT | NEEDS-VERIFY |  |  | .block-ready | PR #1063 title-match only, unverified |
| CHAIN-01-vendor-picker-fix | NEEDS-VERIFY | 💰 | T2 | program | PR #1262 title-match only, unverified |
| CHAIN-02-account-register-params | NEEDS-VERIFY | 💰 |  | program | PR #1263 title-match only, unverified |
| CHAIN-03-create-bill-gl-autopost | NEEDS-VERIFY | 💰 | T1 | program | PR #1300 title-match only, unverified |
| CHAIN-04-bill-payment-tieout | NEEDS-VERIFY | 💰 | T1 | program | PR #1267 title-match only, unverified |
| CHAIN-05-bank-feed-live-proof | NEEDS-VERIFY | 💰 | T1 | program | PR #1268 title-match only, unverified |
| CHAIN-06-invoice-ar-chain-proof | NEEDS-VERIFY | 💰 | T1 | program | PR #1269 title-match only, unverified |
| CHAIN-07-settlements-500-fix | NEEDS-VERIFY | 💰 | T1 | program | PR #1270 title-match only, unverified |
| PREREQ-A-SCHEMA-GRANT-GATE | NEEDS-VERIFY |  |  | .block-ready | PR #684 title-match only, unverified |
| STMT-1-balance-sheet-cash-flow | NEEDS-VERIFY | 💰 | T2 | program | PR #1265 title-match only, unverified |
| A1-AUDIT-SPINE-LINK-COLUMNS | DONE | 💰 |  | .block-ready | PR #884 merged 2026-06-11 |
| A2-AUDIT-EMIT-DISPATCH | DONE |  |  | .block-ready | PR #886 merged 2026-06-12 |
| A3-AUDIT-EMIT-MAINTENANCE | DONE |  |  | .block-ready | PR #888 merged 2026-06-12 |
| A4-AUDIT-EMIT-ACCOUNTING | DONE |  |  | .block-ready | PR #889 merged 2026-06-12 |
| A5-AUDIT-EMIT-BANKING | DONE |  |  | .block-ready | PR #890 merged 2026-06-12 |
| A6-AUDIT-UNIVERSAL-VIEW | DONE |  |  | .block-ready | PR #891 merged 2026-06-12 |
| A7-AUDIT-PER-ENTITY-TABS | DONE |  |  | .block-ready | PR #909 merged 2026-06-12 |
| A8-AUDIT-REPORTS-SECTION | DONE |  |  | .block-ready | PR #899 merged 2026-06-12 |
| A9-AUDIT-CI-EMIT-GUARD | DONE |  |  | .block-ready | PR #901 merged 2026-06-12 |
| ACCT-BLOCK-10-ACCOUNT-BALANCES | DONE |  |  | .block-ready | PR #709 merged 2026-06-08 |
| ACCT-BLOCK-11-PERIODS-INIT | DONE |  |  | .block-ready | PR #814 merged 2026-06-09 |
| ACCT-COA-CANONICALIZATION | DONE |  |  | .block-ready | PR #715 merged 2026-06-08 |
| ACCT-INTEGRITY-VERIFY-EXTEND | DONE |  |  | .block-ready | PR #816 merged 2026-06-09 |
| ACCT-QBOPAR-00-DESIGN-LOCK | DONE |  |  | .block-ready | PR #703 merged 2026-06-07 |
| ACCT-QBOPAR-01-CATALOG-BACKEND | DONE |  |  | .block-ready | all 16 file(s) on main |
| ACCT-QBOPAR-02 | DONE |  |  | .block-ready | PR #710 merged 2026-06-07 |
| ACCT-QBOPAR-03 | DONE |  |  | .block-ready | PR #740 merged 2026-06-08 |
| ACCT-QBOPAR-04 | DONE |  |  | .block-ready | PR #815 merged 2026-06-08 |
| BLOCK-04-of-29-TIER2-RATE-LIMIT | DONE |  | T2 | enterprise-29 | all 1 named artifact(s) on main |
| BLOCK-05-of-29-TIER2-CIRCUIT-BREAKERS | DONE |  | T2 | enterprise-29 | all 1 named artifact(s) on main |
| BLOCK-05-TIER2-CIRCUIT-BREAKERS | DONE |  |  | .block-ready | PR #800 merged 2026-06-08 |
| BLOCK-06-of-29-TIER2-OUTBOX-DLQ | DONE |  | T2 | enterprise-29 | all 1 named artifact(s) on main |
| BLOCK-07-of-29-TIER2-PAGINATION-AUDIT | DONE |  | T2 | enterprise-29 | all 1 named artifact(s) on main |
| BLOCK-08-of-29-TIER2-LOAD-TEST | DONE |  | T2 | enterprise-29 | all 1 named artifact(s) on main |
| BLOCK-08-TIER2-LOAD-TEST | DONE |  |  | .block-ready | PR #796 merged 2026-06-08 |
| BLOCK-09-TIER2-E2E-PATHS | DONE |  |  | .block-ready | PR #802 merged 2026-06-09 |
| block-10-account-balances | DONE | 💰 |  | accounting | branch feat/acct-block-10-account-balances → PR #709 merged 2026-06-08 |
| BLOCK-10-driver-inactivity | DONE |  | T1 | program | all 2 named artifact(s) on main |
| BLOCK-10-of-29-TIER2-RLS-TEST-GATE | DONE |  | T2 | enterprise-29 | all 1 named artifact(s) on main |
| BLOCK-10-TIER2-RLS-TEST-GATE | DONE |  |  | .block-ready | PR #801 merged 2026-06-09 |
| BLOCK-11-of-29-TIER2-AUDIT-COVERAGE | DONE |  | T2 | enterprise-29 | all 1 named artifact(s) on main |
| BLOCK-12-of-29-TIER2-DESTRUCT-PREFLIGHT | DONE |  | T2 | enterprise-29 | all 1 named artifact(s) on main |
| BLOCK-13-of-29-TIER2-TUNING-CATALOG | DONE |  | T2 | enterprise-29 | all 1 named artifact(s) on main |
| BLOCK-13-TIER2-TUNING-CATALOG | DONE |  |  | .block-ready | PR #794 merged 2026-06-08 |
| BLOCK-14-of-29-TIER2.5-MEXICO-OPS | DONE |  | T2.5 | enterprise-29 | all 2 named artifact(s) on main |
| BLOCK-15-of-29-TIER2.5-MECHANIC-SHOP | DONE |  | T2.5 | enterprise-29 | all 2 named artifact(s) on main |
| BLOCK-16-COMPLIANCE-DASHBOARD | DONE |  |  | .block-ready | PR #701 merged 2026-06-07 |
| BLOCK-16-of-29-TIER2.5-FUEL-CARD | DONE |  | T2.5 | enterprise-29 | all 1 named artifact(s) on main |
| block-20-cash-basis | DONE | 💰 |  | accounting | all 3 named artifact(s) on main |
| block-20-frontend-selector | DONE | 💰 |  | accounting | all 9 named artifact(s) on main |
| block-20-period-close-lock | DONE | 💰 |  | accounting | all 1 named artifact(s) on main |
| block-21-expense-category-map | DONE | 💰 |  | accounting | all 1 named artifact(s) on main |
| BLOCK-21-of-29-TIER3-DR-DRILL | DONE |  | T3 | enterprise-29 | all 1 named artifact(s) on main |
| block-22-driver-settlement-engine | DONE | 💰 |  | accounting | all 4 named artifact(s) on main |
| BLOCK-22-of-29-TIER3-OPS-RUNBOOKS | DONE |  | T3 | enterprise-29 | all 1 named artifact(s) on main |
| block-23-escrow-posting-flow | DONE | 💰 |  | accounting | all 1 named artifact(s) on main |
| block-24-factoring-posting | DONE | 💰 |  | accounting | all 4 named artifact(s) on main |
| block-25-factoring-fees-reserves | DONE | 💰 |  | accounting | all 6 named artifact(s) on main |
| block-26-factoring-reconciliation | DONE | 💰 |  | accounting | all 10 named artifact(s) on main |
| block-27-fuel-expense-posting | DONE | 💰 |  | accounting | branch feat/block-27-fuel-expense-posting → PR #203 merged 2026-05-23 |
| BLOCK-27-of-29-TIER4-CANARY | DONE |  | T4 | enterprise-29 | all 1 named artifact(s) on main |
| block-28-maintenance-ap-posting | DONE | 💰 |  | accounting | branch feat/block-28-maintenance-ap-posting → PR #205 merged 2026-05-23 |
| block-29-bank-reconciliation-engine | DONE | 💰 |  | accounting | branch feat/block-29-bank-reconciliation-engine → PR #206 merged 2026-05-23 |
| block-30-bank-reconciliation-ui | DONE | 💰 |  | accounting | all 10 named artifact(s) on main |
| block-31-sales-tax-handling | DONE | 💰 |  | accounting | all 10 named artifact(s) on main |
| block-33-invoice-line-revenue-mapping | DONE | 💰 |  | accounting | branch feat/block-33-invoice-line-revenue-mapping → PR #209 merged 2026-05-23 |
| block-34-payment-application | DONE | 💰 |  | accounting | all 7 named artifact(s) on main |
| block-35-chart-of-accounts-roles | DONE | 💰 |  | accounting | all 6 named artifact(s) on main |
| block-36-multi-entity-accounting | DONE | 💰 |  | accounting | all 9 named artifact(s) on main |
| block-41-posting-lineage-ui | DONE | 💰 |  | accounting | all 5 named artifact(s) on main |
| block-43-live-db-schema-verification | DONE | 💰 |  | accounting | all 2 named artifact(s) on main |
| BLOCK-C-DEDUCTION-CAP | DONE |  |  | .block-ready | PR #692 merged 2026-06-07 |
| BLOCK-C-MIGRATION-RENAME | DONE |  |  | .block-ready | PR #698 merged 2026-06-07 |
| block-cf-cash-forecast | DONE | 💰 |  | accounting | all 2 named artifact(s) on main |
| block-cmc-month-close-wizard | DONE | 💰 |  | accounting | all 1 named artifact(s) on main |
| BLOCK-D-INSURANCE-RENEWAL | DONE |  |  | .block-ready | PR #699 merged 2026-06-07 |
| BLOCK-E-INSURANCE-FLEET | DONE |  |  | .block-ready | PR #702 merged 2026-06-07 |
| BLOCK-F-INSURANCE-CANCELLATION | DONE |  |  | .block-ready | PR #700 merged 2026-06-07 |
| BLOCK-G-COI-PDF | DONE |  |  | .block-ready | all 4 file(s) on main |
| BLOCK-H-DETENTION-NOTIFY | DONE |  |  | .block-ready | PR #693 merged 2026-06-07 |
| block-ppc-period-comparison | DONE | 💰 |  | accounting | all 1 named artifact(s) on main |
| BLOCK5-INSURANCE-FORWARD-FIX | DONE |  |  | .block-ready | PR #695 merged 2026-06-07 |
| BLOCK7-DRIVER-HUB-REQUESTS | DONE |  |  | .block-ready | PR #694 merged 2026-06-07 |
| BUG-ADD-USER-INERT | DONE |  |  | .block-ready | PR #861 merged 2026-06-10 |
| C1-PRE-SETTLEMENTS | DONE |  |  | .block-ready | PR #900 merged 2026-06-12 |
| C2-FACTORING-PROFILE | DONE |  |  | .block-ready | PR #904 merged 2026-06-12 |
| C3-CUSTOMER-CONTRACT-UPLOAD | DONE |  |  | .block-ready | PR #902 merged 2026-06-12 |
| C4-CUST-VEND-REBUILD-RECLASSIFY | DONE |  |  | .block-ready | PR #905 merged 2026-06-12 |
| C6-HOME-DASHBOARD | DONE | 💰 |  | .block-ready | all 3 file(s) on main |
| C7-ACCT-SUBNAV-CHROME | DONE | 💰 |  | .block-ready | all 10 file(s) on main |
| CAP-AUTOSTATUS | DONE |  |  | program | all 1 named artifact(s) on main |
| CAP-CARGOTEMP | DONE |  |  | program | all 2 named artifact(s) on main |
| CAP-ENGINEWO | DONE |  |  | program | all 2 named artifact(s) on main |
| CAP-FUELFRAUD | DONE |  |  | program | all 1 named artifact(s) on main |
| CAP-GPS | DONE |  |  | program | all 3 named artifact(s) on main |
| CAP-PREDICTIVE | DONE |  |  | program | all 2 named artifact(s) on main |
| CAP-SCORING | DONE |  |  | program | all 2 named artifact(s) on main |
| CHORE-MASTER-TRACKER-MD | DONE | 💰 |  | .block-ready | PR #924 merged 2026-06-13 |
| CHORE-UNVERIFIED-ROWS-RECONCILE | DONE | 💰 |  | .block-ready | PR #928 merged 2026-06-13 |
| CLOSURE-10-MAINT-PARTS-CATALOG | DONE |  |  | .block-ready | PR #798 merged 2026-06-09 |
| CLOSURE-11-MAINT-SERVICES-CATALOG | DONE |  |  | .block-ready | PR #799 merged 2026-06-08 |
| CLOSURE-12-CYCLE5-PAYROLL-INTEGRATION | DONE |  |  | .block-ready | PR #795 merged 2026-06-08 |
| CLOSURE-13-USMCA-JULY-LAUNCH | DONE |  |  | .block-ready | PR #797 merged 2026-06-08 |
| CLOSURE-16-DEEP-AUDIT-C | DONE |  |  | .block-ready | PR #793 merged 2026-06-08 |
| CLOSURE-17-ON-HOLD-TRIAGE | DONE |  |  | .block-ready | PR #788 merged 2026-06-08 |
| CLOSURE-18-PERF-AUDIT | DONE |  |  | .block-ready | PR #792 merged 2026-06-08 |
| CLOSURE-19-SEC-AUDIT | DONE |  |  | .block-ready | PR #785 merged 2026-06-08 |
| CLOSURE-20-A11Y-AUDIT | DONE |  |  | .block-ready | PR #787 merged 2026-06-09 |
| CLOSURE-21-MONITORING-SETUP | DONE |  |  | .block-ready | PR #791 merged 2026-06-10 |
| CLOSURE-23-DR-BACKUP-AUDIT | DONE |  |  | .block-ready | PR #786 merged 2026-06-08 |
| CLOSURE-24-OPERATOR-ONBOARDING | DONE |  |  | .block-ready | PR #790 merged 2026-06-09 |
| CLOSURE-25-RUNBOOKS | DONE |  |  | .block-ready | PR #789 merged 2026-06-10 |
| D1-SETTLEMENTS-APPROVAL-PDF | DONE |  |  | .block-ready | PR #910 merged 2026-06-12 |
| DESIGN-STD-NAVY-PAGE-BANNER | DONE |  |  | .block-ready | PR #898 merged 2026-06-12 |
| DISP-DRAWER-WIRE | DONE |  |  | .block-ready | PR #746 merged 2026-06-08 |
| DISP-FACTORING-PACKET | DONE |  |  | .block-ready | PR #750 merged 2026-06-08 |
| DISP-FINES-DEDUCT | DONE |  |  | .block-ready | PR #762 merged 2026-06-08 |
| DISP-KANBAN-dispatch-kanban-board | DONE |  |  | program | all 2 named artifact(s) on main |
| DISP-KANBAN-STATES | DONE |  |  | .block-ready | PR #751 merged 2026-06-08 |
| DISP-LIST-TABLE-ASSIGN | DONE |  |  | .block-ready | PR #758 merged 2026-06-08 |
| DISP-OVERVIEW | DONE |  |  | .block-ready | PR #752 merged 2026-06-08 |
| DISP-OVERVIEW-dispatch-overview | DONE |  |  | program | all 2 named artifact(s) on main |
| DISP-PLANNERS | DONE |  |  | .block-ready | all 11 file(s) on main |
| DISP-PROFIT-load-profitability | DONE |  |  | program | all 2 named artifact(s) on main |
| DISP-PROFITABILITY | DONE |  |  | .block-ready | PR #743 merged 2026-06-08 |
| DISP-QUEUES-NAV | DONE |  |  | .block-ready | PR #753 merged 2026-06-08 |
| DISP-ROUNDTRIPS | DONE |  |  | .block-ready | PR #756 merged 2026-06-08 |
| DISPATCH-LIVE-ETA | DONE |  |  | .block-ready | PR #688 merged 2026-06-07 |
| DOCS-AUDIT-LINKAGE-SPECS | DONE |  |  | .block-ready | PR #882 merged 2026-06-11 |
| DOCS-B9-ESCROW-DESIGN | DONE |  |  | .block-ready | PR #948 merged 2026-06-14 |
| DOCS-DISPATCH-LANE-ENFORCEMENT-V2 | DONE |  |  | .block-ready | PR #742 merged 2026-06-08 |
| DOCS-FACTORING-ACCOUNTING-STRUCTURE | DONE |  |  | .block-ready | PR #738 merged 2026-06-08 |
| DOCS-FH1-FIXED-ASSETS-DEPRECIATION | DONE |  |  | .block-ready | PR #957 merged 2026-06-14 |
| DOCS-FH1-LEASING-FOLLOWUP | DONE |  |  | .block-ready | PR #967 merged 2026-06-15 |
| DOCS-FH2-LOAN-WIZARD | DONE |  |  | .block-ready | PR #959 merged 2026-06-14 |
| DOCS-FH3-AMORTIZATION-ENGINE | DONE |  |  | .block-ready | PR #958 merged 2026-06-14 |
| DOCS-FH4-FINANCE-CALCULATOR | DONE |  |  | .block-ready | PR #960 merged 2026-06-14 |
| DOCS-FH5-BANKRUPTCY-MODELER | DONE |  |  | .block-ready | PR #963 merged 2026-06-14 |
| DOCS-FH5-POSTING-LOCKED | DONE |  |  | .block-ready | PR #969 merged 2026-06-15 |
| DOCS-FH6-TAX-MANAGER | DONE |  |  | .block-ready | PR #961 merged 2026-06-14 |
| DOCS-FH7-UNIT-ALLOCATION | DONE |  |  | .block-ready | PR #962 merged 2026-06-14 |
| DOCS-FH8-LEASE-CONTRACT | DONE |  |  | .block-ready | PR #965 merged 2026-06-15 |
| DOCS-FINANCE-ANSWERED-QS-FOLLOWUP | DONE |  |  | .block-ready | PR #968 merged 2026-06-15 |
| DOCS-GEOFENCE-INSURANCE-SPEC | DONE |  |  | .block-ready | PR #719 merged 2026-06-08 |
| DOCS-MILEAGE-LIFECYCLE-CORRECTION | DONE |  |  | .block-ready | PR #954 merged 2026-06-14 |
| DOCS-MILEAGE-MODEL-ANSWERS | DONE |  |  | .block-ready | PR #946 merged 2026-06-14 |
| DOCS-MILEAGE-MODEL-DESIGN | DONE |  |  | .block-ready | PR #943 merged 2026-06-14 |
| DOCS-PERMISSIONS-DESIGN | DONE |  |  | .block-ready | PR #953 merged 2026-06-14 |
| DOCS-QBO-PARITY-CAPTURE-V2 | DONE |  |  | .block-ready | PR #826 merged 2026-06-09 |
| DOCS-RECON-TRACKER-ESCROW-RESEARCH-0614 | DONE |  |  | .block-ready | PR #937 merged 2026-06-14 |
| DOCS-RELAY-INTERNAL-BANK-DESIGN | DONE |  |  | .block-ready | PR #956 merged 2026-06-14 |
| DOCS-RLS-COVERAGE-AUDIT | DONE |  |  | .block-ready | PR #947 merged 2026-06-14 |
| DOCS-ROLE-BINDINGS-WORKSHEET | DONE |  |  | .block-ready | PR #716 merged 2026-06-08 |
| DOCS-VOID-EVERYWHERE-DESIGN | DONE |  |  | .block-ready | PR #964 merged 2026-06-14 |
| E1-SMOKE-SERVICE-TOKEN-AUTH | DONE |  |  | .block-ready | PR #906 merged 2026-06-12 |
| FEAT-ACCOUNT-REGISTER-D5 | DONE |  |  | .block-ready | PR #976 merged 2026-06-15 |
| FEAT-B1-EXPENSE-CATEGORY-MAP-SEED | DONE |  |  | .block-ready | PR #918 merged 2026-06-13 |
| FEAT-B2-POSTING-ENGINE-CASH-ADVANCE | DONE |  |  | .block-ready | PR #919 merged 2026-06-13 |
| FEAT-B3-EMPLOYEE-LOAN-LEDGER | DONE |  |  | .block-ready | PR #920 merged 2026-06-13 |
| FEAT-B4-DRIVER-REQUEST-AUDIT-TIMELINE | DONE |  |  | .block-ready | PR #921 merged 2026-06-13 |
| FEAT-B5-CASH-ADVANCE-APPROVE-CASCADE | DONE |  |  | .block-ready | PR #922 merged 2026-06-13 |
| FEAT-B6-DRIVER-INBOX-UI | DONE | 💰 |  | .block-ready | PR #923 merged 2026-06-13 |
| FEAT-CLASSES-BULK-EDIT | DONE |  |  | .block-ready | PR #952 merged 2026-06-14 |
| FEAT-DISP-CASHFLOW-LINK | DONE |  |  | .block-ready | PR #744 merged 2026-06-08 |
| FEAT-DISP-DRAWER-WIRE | DONE |  |  | .block-ready | PR #746 merged 2026-06-08 |
| FEAT-DISPATCH-PLANNERS-SPLIT-NAV | DONE |  |  | .block-ready | PR #944 merged 2026-06-14 |
| FEAT-DOCS-UPLOAD-UI | DONE |  |  | .block-ready | PR #949 merged 2026-06-14 |
| FEAT-DRIVER-ESCROW-SUBACCOUNT-V2 | DONE | 💰 |  | .block-ready | PR #934 merged 2026-06-14 |
| FEAT-DRIVER-HUB-ROUTE-WIRE | DONE |  |  | .block-ready | PR #822 merged 2026-06-09 |
| FEAT-DRIVER-INBOX-REPORTING | DONE |  |  | .block-ready | PR #951 merged 2026-06-14 |
| FEAT-DRIVER-SUBACCOUNT-ASSET-PROVISION | DONE | 💰 |  | .block-ready | PR #933 merged 2026-06-14 |
| FEAT-DRIVER-SUBACCOUNT-BULK-BACKFILL-DRYRUN | DONE | 💰 |  | .block-ready | PR #935 merged 2026-06-14 |
| FEAT-EXPENSES-PHASE1-5-BUILD | DONE | 💰 |  | .block-ready | PR #1008 merged 2026-06-15 |
| FEAT-EXPENSES-PHASE1-FOUNDATION | DONE | 💰 |  | .block-ready | PR #1006 merged 2026-06-15 |
| FEAT-EXPENSES-PHASE2-STEP3-POSTING-BUILD | DONE | 💰 |  | .block-ready | PR #1018 merged 2026-06-15 |
| FEAT-EXPENSES-PHASE2-UNCATEGORIZED-SEED | DONE | 💰 |  | .block-ready | PR #1015 merged 2026-06-15 |
| FEAT-FH-2-LOAN-WIZARD | DONE | 💰 |  | .block-ready | PR #1023 merged 2026-06-16 |
| FEAT-FH-3-AMORTIZATION | DONE | 💰 |  | .block-ready | PR #1026 merged 2026-06-16 |
| FEAT-FH-4-CALCULATOR | DONE | 💰 |  | .block-ready | PR #1027 merged 2026-06-16 |
| FEAT-FH1-FIXED-ASSETS-DATA-MODEL | DONE | 💰 |  | .block-ready | PR #1017 merged 2026-06-15 |
| FEAT-HELP-ARTICLE-STUBS | DONE |  |  | .block-ready | PR #950 merged 2026-06-14 |
| FEAT-HIDE-STUB-NAV-PAGES | DONE |  |  | .block-ready | PR #945 merged 2026-06-14 |
| FEAT-INSURANCE-POLICY-WIZARD | DONE |  |  | .block-ready | PR #737 merged 2026-06-08 |
| FEAT-INVENTORY-PARTS-404-FIX | DONE | 💰 |  | .block-ready | PR #926 merged 2026-06-13 |
| FEAT-PERIODS-INIT-TRK-2025-H2 | DONE | 💰 |  | .block-ready | PR #927 merged 2026-06-13 |
| FEAT-QBO-PARITY-A1-TABLE-GRAMMAR | DONE |  |  | .block-ready | PR #824 merged 2026-06-09 |
| FEAT-QBO-PARITY-A3-SIZING | DONE |  |  | .block-ready | PR #825 merged 2026-06-09 |
| FEAT-QBO-PARITY-DOCS | DONE |  |  | .block-ready | PR #823 merged 2026-06-09 |
| FEAT-REEFER-HOURS-POLL-CRON | DONE |  |  | .block-ready | PR #942 merged 2026-06-14 |
| FEAT-SETTLEMENT-DEDUCTION-LEDGER-DDL | DONE | 💰 |  | .block-ready | PR #925 merged 2026-06-13 |
| FEAT-SETTLEMENT-RECOVERY-CAPPED-PAYROLL | DONE | 💰 |  | .block-ready | PR #929 merged 2026-06-14 |
| FEAT-SETTLEMENT-RECOVERY-CAPPED-WIRING | DONE | 💰 |  | .block-ready | PR #930 merged 2026-06-14 |
| FEAT-SETTLEMENT-RECOVERY-GL-JE | DONE | 💰 |  | .block-ready | PR #931 merged 2026-06-14 |
| FEAT-SETTLEMENT-SHADOW-RUN | DONE | 💰 |  | .block-ready | PR #932 merged 2026-06-14 |
| FEAT-SIDEBAR-V2-REORG-25 | DONE |  |  | .block-ready | PR #859 merged 2026-06-10 |
| FEAT-TASK-BOARD-CREATE-TASK-UI | DONE |  |  | .block-ready | PR #940 merged 2026-06-14 |
| FEAT-TRACKER-EXPORT-GITHUB-TABS | DONE |  |  | .block-ready | PR #941 merged 2026-06-14 |
| FEAT-V0-SIDEBAR-DRIVER-HUB | DONE |  |  | .block-ready | PR #827 merged 2026-06-09 |
| FEAT-V2-A2-REFERENCE-SELECT | DONE |  |  | .block-ready | PR #828 merged 2026-06-09 |
| FEAT-VOID-EVERYWHERE-PR1 | DONE | 💰 |  | .block-ready | PR #973 merged 2026-06-15 |
| FEAT-VOID-EVERYWHERE-PR2 | DONE | 💰 |  | .block-ready | PR #977 merged 2026-06-15 |
| FIX-AT-RISK-LOADS-SD-CITY | DONE |  |  | .block-ready | PR #820 merged 2026-06-08 |
| FIX-AUDIT-KPI-DRIFTS | DONE |  |  | .block-ready | PR #480 merged 2026-06-04 |
| FIX-AUDIT-NESTED-MODALS | DONE |  |  | .block-ready | PR #462 merged 2026-06-04 |
| FIX-AUDIT-PROD-STUBS | DONE |  |  | .block-ready | PR #471 merged 2026-06-04 |
| FIX-AUDIT-TEST-DATA-LEAK | DONE |  |  | .block-ready | PR #469 merged 2026-06-04 |
| FIX-CANARY-SMOKE-DURABLE | DONE |  |  | .block-ready | all 1 file(s) on main |
| FIX-CI-YML-CONFLICT-MARKERS | DONE | 💰 |  | .block-ready | PR #875 merged 2026-06-11 |
| FIX-COA-UNCATEGORIZED-EXPENSE-QBO-RECONCILE | DONE | 💰 |  | .block-ready | PR #1019 merged 2026-06-15 |
| FIX-DEPLOY-MIGRATION-DRIFT | DONE | 💰 |  | .block-ready | PR #878 merged 2026-06-11 |
| FIX-DISPATCH-SUBNAV-ROUTING | DONE |  |  | .block-ready | PR #818 merged 2026-06-08 |
| FIX-DOUBLE-STRINGIFY-SWEEP-NONMONEY | DONE |  |  | .block-ready | PR #975 merged 2026-06-15 |
| FIX-FINANCE-DOUBLE-STRINGIFY-SWEEP | DONE |  |  | .block-ready | PR #971 merged 2026-06-15 |
| FIX-FUEL-SUBNAV-ROUTING | DONE |  |  | .block-ready | PR #817 merged 2026-06-08 |
| FIX-GUARD-M2-FK-DETECTION | DONE |  |  | .block-ready | PR #917 merged 2026-06-13 |
| FIX-INSURANCE-POLICY-UNIT-IS-ACTIVE | DONE | 💰 |  | .block-ready | PR #1011 merged 2026-06-15 |
| FIX-P8-AUDIT-NESTED-MODALS | DONE |  |  | .block-ready | PR #907 merged 2026-06-12 |
| FIX-REMOVE-LEFT-SIDEBAR-HOVER-DROPDOWN | DONE |  |  | .block-ready | PR #974 merged 2026-06-15 |
| FIX-RLS-BILL-EXPENSE-LINES | DONE |  |  | .block-ready | PR #714 merged 2026-06-08 |
| FIX-SAFETY-NAV-COUNT | DONE |  |  | .block-ready | PR #647 merged 2026-06-07 |
| FIX-SAMSARA-WEBHOOKS-INVESTIGATION | DONE |  |  | .block-ready | PR #475 merged 2026-06-04 |
| FIX-STEP3-POSTING-BALANCED-JE-PROOF | DONE | 💰 |  | .block-ready | PR #1021 merged 2026-06-15 |
| FIX-TASK-CREATE-DOUBLE-STRINGIFY | DONE |  |  | .block-ready | PR #970 merged 2026-06-15 |
| FIX-TEST-JSDOM-ENV-MISSING | DONE |  |  | .block-ready | PR #863 merged 2026-06-10 |
| FIX-URL-NORMALIZE | DONE |  |  | .block-ready | PR #819 merged 2026-06-08 |
| FOLLOWUP-SPECS-2026-06-07 | DONE |  |  | .block-ready | PR #689 merged 2026-06-07 |
| GAP-10-DELTA-CANCELLATIONS-REPORT | DONE |  |  | .block-ready | PR #663 merged 2026-06-07 |
| GAP-11-DELTA-UPLOAD-EXPENSE | DONE |  |  | .block-ready | PR #666 merged 2026-06-07 |
| GAP-14-PRE-DISPATCH-VALIDATION | DONE |  |  | .block-ready | all 6 file(s) on main |
| gap-14-validation-pre-dispatch | DONE |  |  | gap-spec | all 6 named artifact(s) on main |
| GAP-18-DRIVER-COMM-TIMELINE | DONE |  |  | .block-ready | PR #682 merged 2026-06-07 |
| GAP-19-DETENTION-INVOICE | DONE |  |  | .block-ready | PR #686 merged 2026-06-07 |
| GAP-20 | DONE |  |  | .block-ready | PR #704 merged 2026-06-07 |
| gap-20-recurring-bills | DONE |  |  | gap-spec | all 2 named artifact(s) on main |
| GAP-23 | DONE |  |  | .block-ready | PR #662 merged 2026-06-07 |
| gap-23-samsara-cache-tiers | DONE |  |  | gap-spec | all 2 named artifact(s) on main |
| GAP-24-FRESHNESS-INDICATOR | DONE |  |  | .block-ready | PR #685 merged 2026-06-07 |
| GAP-25 | DONE |  |  | .block-ready | PR #707 merged 2026-06-08 |
| gap-25-active-driver-set | DONE |  |  | gap-spec | all 3 named artifact(s) on main |
| GAP-26 | DONE |  |  | .block-ready | PR #722 merged 2026-06-08 |
| gap-26-border-crossings | DONE |  |  | gap-spec | all 2 named artifact(s) on main |
| GAP-27 | DONE |  |  | .block-ready | PR #724 merged 2026-06-08 |
| gap-27-geofence-reconciliation | DONE |  |  | gap-spec | all 2 named artifact(s) on main |
| GAP-28 | DONE |  |  | .block-ready | all 8 file(s) on main |
| gap-28-layover-detection | DONE |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-29 | DONE |  |  | .block-ready | all 7 file(s) on main |
| gap-29-booking-gap-analytics | DONE |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-30 | DONE |  |  | .block-ready | PR #665 merged 2026-06-07 |
| gap-30-late-arrival-analytics | DONE |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-31 | DONE |  |  | .block-ready | PR #761 merged 2026-06-08 |
| gap-31-multi-stop-extra-rates | DONE |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-32 | DONE |  |  | .block-ready | PR #760 merged 2026-06-08 |
| gap-32-customer-free-time-detention | DONE |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-34 | DONE |  |  | .block-ready | PR #667 merged 2026-06-07 |
| gap-34-driver-pwa-dispatch | DONE |  |  | gap-spec | all 2 named artifact(s) on main |
| GAP-36 | DONE |  |  | .block-ready | PR #759 merged 2026-06-08 |
| gap-36-driver-pwa-incident-full | DONE |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-37 | DONE |  |  | .block-ready | PR #765 merged 2026-06-08 |
| gap-37-equipment-dual-confirm-transfer | DONE |  |  | gap-spec | all 5 named artifact(s) on main |
| GAP-38-DAMAGE-INSURANCE-CONTINUITY | DONE |  |  | .block-ready | PR #671 merged 2026-06-07 |
| GAP-39 | DONE |  |  | .block-ready | PR #669 merged 2026-06-07 |
| gap-39-geofence-state-machine | DONE |  |  | gap-spec | all 2 named artifact(s) on main |
| GAP-40 | DONE |  |  | .block-ready | PR #673 merged 2026-06-07 |
| gap-40-damage-photo-exif-chain | DONE |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-41 | DONE |  |  | .block-ready | PR #672 merged 2026-06-07 |
| gap-41-reports-hub-9-categories | DONE |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-42 | DONE |  |  | .block-ready | PR #767 merged 2026-06-08 |
| gap-42-ifta-quarterly-preparer | DONE |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-43 | DONE |  |  | .block-ready | PR #768 merged 2026-06-08 |
| gap-43-scheduled-reports | DONE |  |  | gap-spec | all 5 named artifact(s) on main |
| GAP-44 | DONE |  |  | .block-ready | PR #674 merged 2026-06-07 |
| gap-44-form-425c-exhibits | DONE |  |  | gap-spec | all 2 named artifact(s) on main |
| GAP-45 | DONE |  |  | .block-ready | PR #763 merged 2026-06-08 |
| gap-45-cash-flow-cpm-routes | DONE |  |  | gap-spec | all 2 named artifact(s) on main |
| GAP-46 | DONE |  |  | .block-ready | PR #769 merged 2026-06-08 |
| gap-46-anomaly-detection | DONE |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-47 | DONE |  |  | .block-ready | PR #770 merged 2026-06-08 |
| gap-47-dispatch-auth-gates | DONE |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-48 | DONE |  |  | .block-ready | PR #676 merged 2026-06-07 |
| gap-48-driver-operations-depth | DONE |  |  | gap-spec | all 2 named artifact(s) on main |
| GAP-49 | DONE |  |  | .block-ready | PR #675 merged 2026-06-07 |
| gap-49-dvir-severity-tagging | DONE |  |  | gap-spec | all 10 named artifact(s) on main |
| GAP-50 | DONE |  |  | .block-ready | PR #677 merged 2026-06-07 |
| gap-50-ai-photo-comparison | DONE |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-51 | DONE |  |  | .block-ready | PR #772 merged 2026-06-08 |
| GAP-52 | DONE |  |  | .block-ready | PR #773 merged 2026-06-08 |
| gap-52-driver-vendor-mapping-integrity | DONE |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-53 | DONE |  |  | .block-ready | PR #774 merged 2026-06-08 |
| gap-53-bank-multi-company-drift | DONE |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-54 | DONE |  |  | .block-ready | PR #775 merged 2026-06-08 |
| gap-54-wf-051-250-foot-correction | DONE |  |  | gap-spec | all 2 named artifact(s) on main |
| GAP-55 | DONE |  |  | .block-ready | PR #776 merged 2026-06-08 |
| gap-55-cap-1-live-gps | DONE |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-56 | DONE |  |  | .block-ready | PR #779 merged 2026-06-08 |
| gap-56-cap-4-auto-status-switch | DONE |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-57 | DONE |  |  | .block-ready | PR #781 merged 2026-06-08 |
| gap-57-cap-5-tri-signal | DONE |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-58 | DONE |  |  | .block-ready | PR #777 merged 2026-06-08 |
| gap-58-cap-8-engine-fault-auto-wo | DONE |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-59 | DONE |  |  | .block-ready | PR #778 merged 2026-06-08 |
| gap-59-cap-9-vehicle-driver-pairing | DONE |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-60 | DONE |  |  | .block-ready | PR #780 merged 2026-06-08 |
| gap-60-cap-10-driver-scoring | DONE |  |  | gap-spec | all 6 named artifact(s) on main |
| GAP-61 | DONE |  |  | .block-ready | PR #681 merged 2026-06-07 |
| gap-61-cap-11-fuel-fraud-alerts | DONE |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-62-CAP-12-TIRE-TREAD | DONE |  |  | .block-ready | PR #679 merged 2026-06-07 |
| GAP-63 | DONE |  |  | .block-ready | PR #678 merged 2026-06-07 |
| gap-63-cap-13-brake-wear | DONE |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-64 | DONE |  |  | .block-ready | PR #783 merged 2026-06-08 |
| gap-64-cap-14-cargo-sensors | DONE |  |  | gap-spec | all 1 named artifact(s) on main |
| gap-65-owner-todays-attention | DONE |  |  | gap-spec | all 10 named artifact(s) on main |
| GAP-66-DISPATCHER-HOME | DONE |  |  | .block-ready | PR #645 merged 2026-06-07 |
| gap-66-dispatcher-home-view | DONE |  |  | gap-spec | all 4 named artifact(s) on main |
| GAP-67-ACCOUNTING-HOME | DONE |  |  | .block-ready | PR #652 merged 2026-06-07 |
| gap-67-accounting-home-view | DONE |  |  | gap-spec | all 2 named artifact(s) on main |
| GAP-68-SAFETY-OFFICER-HOME | DONE |  |  | .block-ready | PR #653 merged 2026-06-07 |
| gap-68-safety-officer-home-view | DONE |  |  | gap-spec | all 7 named artifact(s) on main |
| GAP-69-DRIVER-MANAGER-HOME | DONE |  |  | .block-ready | PR #654 merged 2026-06-07 |
| gap-69-driver-manager-home-view | DONE |  |  | gap-spec | all 7 named artifact(s) on main |
| GAP-7 | DONE |  |  | .block-ready | PR #660 merged 2026-06-07 |
| gap-7-severe-repair-oos-estimate | DONE |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-70 | DONE |  |  | .block-ready | PR #691 merged 2026-06-07 |
| gap-70-edi-foundation | DONE |  |  | gap-spec | all 2 named artifact(s) on main |
| GAP-71 | DONE |  |  | .block-ready | PR #784 merged 2026-06-08 |
| gap-71-driver-retention-model | DONE |  |  | gap-spec | all 2 named artifact(s) on main |
| GAP-72 | DONE |  |  | .block-ready | PR #782 merged 2026-06-08 |
| gap-72-customer-relationship-score | DONE |  |  | gap-spec | all 7 named artifact(s) on main |
| GAP-76 | DONE |  |  | .block-ready | all 7 file(s) on main |
| gap-76-deadhead-optimizer | DONE |  |  | gap-spec | all 2 named artifact(s) on main |
| GAP-8 | DONE |  |  | .block-ready | PR #661 merged 2026-06-07 |
| gap-8-assignments-quicksave | DONE |  |  | gap-spec | all 1 named artifact(s) on main |
| gap-81-drug-alcohol-program | DONE |  |  | gap-spec | all 3 named artifact(s) on main |
| gap-82-cert-expiry-tracking | DONE |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-82-MEDICAL-CARD-TRACKING | DONE |  |  | .block-ready | PR #640 merged 2026-06-07 |
| gap-83-eld-audit-trail | DONE |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-83-ELD-AUDIT-VIEWER | DONE |  |  | .block-ready | PR #644 merged 2026-06-07 |
| GAP-84-DOT-INSPECTION-GAP-CLOSE | DONE |  |  | .block-ready | PR #649 merged 2026-06-07 |
| GAP-85-PERMIT-TOLL-TRACKING | DONE |  |  | .block-ready | PR #655 merged 2026-06-07 |
| gap-85-permits-toll-tags | DONE |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-86-INSURANCE-BILL-CREATOR | DONE |  |  | .block-ready | PR #687 merged 2026-06-07 |
| gap-86-insurance-module | DONE |  |  | gap-spec | all 3 named artifact(s) on main |
| GAP-86-POLICY-WIZARD | DONE |  |  | .block-ready | PR #737 merged 2026-06-08 |
| gap-87-audit-log-viewer | DONE |  |  | gap-spec | all 6 named artifact(s) on main |
| gap-89-cmd-k-quick-switcher | DONE |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-89-UNIVERSAL-SEARCH-CMD-K | DONE |  |  | .block-ready | PR #657 merged 2026-06-07 |
| GAP-91-MOBILE-RESPONSIVE-AUDIT | DONE |  |  | .block-ready | PR #658 merged 2026-06-07 |
| GAP-92-FEATURE-FLAG-SYSTEM | DONE |  |  | .block-ready | PR #659 merged 2026-06-07 |
| gap-92-feature-flags | DONE |  |  | gap-spec | all 1 named artifact(s) on main |
| GAP-CI-WIRE-PREPUSH-GUARDS | DONE |  |  | .block-ready | PR #897 merged 2026-06-12 |
| GAP-DOUBLE-ENTRY-DB-ENFORCEMENT | DONE |  |  | .block-ready | PR #708 merged 2026-06-07 |
| GAP-E-PLANNER-TASKS-ROUTES | DONE |  |  | .block-ready | PR #885 merged 2026-06-12 |
| GAP-IDEMP-KEYS | DONE |  |  | .block-ready | PR #737 merged 2026-06-08 |
| GAP-PREMERGE-GATES-EXPAND | DONE |  |  | .block-ready | PR #651 merged 2026-06-07 |
| GLOBAL-SORT-RULE | DONE |  |  | .block-ready | PR #723 merged 2026-06-08 |
| HOS-VIEWER-DONE | DONE |  |  | program | all 3 named artifact(s) on main |
| HOTFIX-0327-MIGRATION-ROLE | DONE |  |  | .block-ready | PR #643 merged 2026-06-07 |
| INS-MODULE | DONE |  |  | program | all 3 named artifact(s) on main |
| ITEM1-TWO-SIDED-ITEM | DONE | 💰 |  | .block-ready | all 2 file(s) on main |
| LOCKDOWN-ENFORCEMENT-GUARDS | DONE |  |  | .block-ready | PR #755 merged 2026-06-08 |
| M1-POSITIONED-PARTS | DONE |  |  | .block-ready | PR #913 merged 2026-06-12 |
| M2-INTEGRITY-POSITION-HISTORY | DONE |  |  | .block-ready | PR #915 merged 2026-06-13 |
| MIGRATION-RUNNER-HARDEN | DONE |  |  | .block-ready | PR #914 merged 2026-06-13 |
| MNT-SHOP | DONE |  |  | program | all 3 named artifact(s) on main |
| MX-OPS | DONE |  |  | program | all 3 named artifact(s) on main |
| OB1-NAV-HEADER-UNIFY | DONE |  |  | .block-ready | PR #894 merged 2026-06-12 |
| P0-BLOCK-3-DRIVER-LOAD-HISTORY | DONE |  |  | .block-ready | PR #731 merged 2026-06-08 |
| P5-T6-BANKING-TRANSFER | DONE |  |  | .block-ready | PR #862 merged 2026-06-10 |
| PREREQ-B-SETTLEMENT-DEDUCTION-SVC | DONE |  |  | .block-ready | PR #683 merged 2026-06-07 |
| Q9-TZ-timezone-library | DONE |  | T2 | program | all 1 named artifact(s) on main |
| RPT-MODULE | DONE |  |  | program | all 3 named artifact(s) on main |
| SAFE-W3 | DONE |  |  | program | all 3 named artifact(s) on main |
| SAFE-W4 | DONE |  |  | program | all 3 named artifact(s) on main |
| SAFE-W5 | DONE |  |  | program | all 3 named artifact(s) on main |
| SETTLEMENTS-SIDEBAR-RENAME-MOVE | DONE |  |  | .block-ready | PR #893 merged 2026-06-12 |
| SHADOW-ROUTE-REDIRECTS | DONE |  |  | .block-ready | PR #887 merged 2026-06-12 |
| SIDEBAR-DRIVER-HUB | DONE |  |  | .block-ready | PR #680 merged 2026-06-07 |
| SIDEBAR-INSURANCE | DONE |  |  | .block-ready | PR #717 merged 2026-06-08 |
| SMOKE-TOKEN-AUTH | DONE |  |  | .block-ready | PR #860 merged 2026-06-10 |
| STRUCTURAL-MANIFEST-SPLIT | DONE |  |  | .block-ready | PR #650 merged 2026-06-07 |
| STRUCTURAL-MIGRATION-TIMESTAMPS | DONE |  |  | .block-ready | PR #648 merged 2026-06-07 |
| TASKS-PLANNER-REDESIGN-V3 | DONE |  |  | .block-ready | PR #892 merged 2026-06-12 |
| TEST-COPY-TO-ACCOUNTING-LINES-BILL-BRANCH | DONE | 💰 |  | .block-ready | PR #1009 merged 2026-06-15 |
| TIER14-MEXICO-OPS | DONE |  |  | .block-ready | PR #804 merged 2026-06-08 |
| TIER15-MECHANIC-SHOP | DONE |  |  | .block-ready | PR #805 merged 2026-06-08 |
| TIER20-SECRETS-ROTATION | DONE |  |  | .block-ready | PR #806 merged 2026-06-08 |
| TIER21-DR-DRILL | DONE |  |  | .block-ready | PR #807 merged 2026-06-08 |
| TIER23-DEGRADATION | DONE |  |  | .block-ready | PR #808 merged 2026-06-08 |
| TIER26-PARTITION | DONE |  |  | .block-ready | PR #809 merged 2026-06-09 |
| TIER27-CANARY | DONE |  |  | .block-ready | PR #810 merged 2026-06-08 |
| TIER28-VENDOR-LOCKIN | DONE |  |  | .block-ready | PR #811 merged 2026-06-08 |
| TIER29-KNOWN-LIMITATIONS | DONE |  |  | .block-ready | PR #813 merged 2026-06-08 |
| UX-A-table-alignment-DONE | DONE |  |  | program | all 1 named artifact(s) on main |
| UX-B-dispatch-location-column | DONE |  | T2 | program | all 1 named artifact(s) on main |
| UX-C-fleet-location | DONE |  | T2 | program | all 2 named artifact(s) on main |
| UX-D-hos-cycle-drawer | DONE |  | T2 | program | all 1 named artifact(s) on main |
| UX-E-compliance-hos-location | DONE |  | T2 | program | all 1 named artifact(s) on main |
| W1-EVENT-LOG-SPINE | DONE | 💰 |  | .block-ready | all 1 file(s) on main |
| W1A-EVENT-LOG-IMMUTABLE | DONE | 💰 |  | .block-ready | PR #870 merged 2026-06-11 |
| W1B-TASKS-MODULE | DONE | 💰 |  | .block-ready | PR #872 merged 2026-06-11 |
| W2A-PROFITABILITY-ENGINE | DONE | 💰 |  | .block-ready | PR #871 merged 2026-06-11 |
| W2B-ALERT-RULES-PROFILES | DONE | 💰 |  | .block-ready | PR #873 merged 2026-06-11 |
| W2P-PLANNER-REDESIGN | DONE | 💰 |  | .block-ready | PR #874 merged 2026-06-11 |
| W3A-GEOFENCE-ENGINE | DONE | 💰 |  | .block-ready | PR #877 merged 2026-06-11 |
| W3B-FORCED-DRIVER-ACK | DONE | 💰 |  | .block-ready | PR #879 merged 2026-06-11 |
| W4A-SIGNED-SAFETY-DOCS | DONE | 💰 |  | .block-ready | PR #880 merged 2026-06-11 |
| W4B-BROKER-AUTO-UPDATE | DONE | 💰 |  | .block-ready | PR #881 merged 2026-06-11 |
| W5-TIME-UTILIZATION | DONE | 💰 |  | .block-ready | PR #883 merged 2026-06-11 |
