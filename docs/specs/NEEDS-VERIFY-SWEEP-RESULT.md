# NEEDS-VERIFY SWEEP — per-block evidence (proposed reclassification)

Read-only evidence sweep of the **94 NEEDS-VERIFY** blocks (the set proven frozen since #1446).
For each: hunted its OWN doc's named artifacts + branch on `origin/main` (7051 files) and
1438 merged PRs. **DONE** = a named branch merged OR every signature artifact the block names is
present on main. **NEEDS-VERIFY (kept)** = partial artifacts or a title-only PR match (genuinely weak).
**PENDING / (GATED)** = a forward spec that named no built artifacts and has no merged PR (it was never
"maybe built" — it's unbuilt). GUARD spot-checks the proposed DONEs before the tracker is trusted.

> **Point-in-time audit of the frozen 94.** After this sweep the classifier (`reconcile-block-status.mjs`)
> was fixed to apply this same evidence logic live (the two structural pins removed), so `npm run reconcile:blocks`
> now reflects these reclassifications automatically. Current honest counts are in
> `docs/trackers/BLOCK-RECONCILIATION-2026-06-26.md` (DONE 276→331, NEEDS-VERIFY 94→69, PENDING 62→32, GATED 24).
>
> **GUARD-priority spot-checks (thin evidence):** `block-21-expense-category-map` proposed DONE on a single
> *generic* artifact (`0010_catalogs_init.sql`, referenced by many blocks) — verify against its real artifact
> (`accounting.expense_category_account_map`, mig 0218 / resolver.service.ts; built per docs/CLAUDE.md §16).
> Single-artifact DONEs backed by a *block-specific* verify script or migration (e.g. `block-23` → its own
> `0234_block_23_escrow_posting_flow.sql`) are strong. The financial DONEs (blocks 22–29) are built-on-main but
> their *runtime* posting remains separately unverified (the "BUILT-BUT-NEVER-RUN" caveat) — DONE here means
> "code present on main," not "posting exercised in prod."

## Proposed outcome (of the original 94)
- **NEEDS-VERIFY**: 38
- **DONE**: 33
- **PENDING**: 19
- **PENDING (GATED)**: 4

## Every swept block (was NEEDS-VERIFY → proposed)
| Block | Source | Fin | Proposed | Evidence |
|-------|--------|-----|----------|----------|
| BK7-INLINE-CREATE-DRAWERS | .block-ready |  | DONE | all 6 named artifact(s) on main: apps/frontend/src/components/parity/InlineCreateDrawer.tsx, apps/frontend/src/components/parity/drawers/NewAccountDrawerForm.tsx, apps/frontend/src/components/parity/drawers/NewClassDrawerForm.tsx … |
| BLOCK-I-CI-DIST-FIX | .block-ready |  | DONE | all 1 named artifact(s) on main: scripts/verify-no-duplicate-routes.mjs |
| PREREQ-A-SCHEMA-GRANT-GATE | .block-ready |  | DONE | all 3 named artifact(s) on main: scripts/verify-migration-schema-grants.mjs, db/migrations/0309_notification_center.sql, db/migrations/202606071420_grant_notifications_schema_to_app.sql |
| block-10-account-balances | accounting | 💰 | DONE | branch feat/acct-block-10-account-balances → PR #709 merged 2026-06-08 |
| block-20-cash-basis | accounting | 💰 | DONE | all 3 named artifact(s) on main: apps/backend/src/accounting/cash-basis/engine.ts, scripts/verify-cash-basis-engine-determinism.mjs, scripts/verify-period-cash-basis-snapshot-shape.mjs |
| block-20-frontend-selector | accounting | 💰 | DONE | all 9 named artifact(s) on main: apps/frontend/src/pages/reports/BalanceSheetPage.tsx, apps/frontend/src/pages/reports/TrialBalancePage.tsx, apps/frontend/src/pages/reports/ProfitLossPage.tsx … |
| block-20-period-close-lock | accounting | 💰 | DONE | all 1 named artifact(s) on main: scripts/verify-period-cash-basis-snapshot-readonly.mjs |
| block-21-expense-category-map | accounting | 💰 | DONE | all 1 named artifact(s) on main: db/migrations/0010_catalogs_init.sql |
| block-22-driver-settlement-engine | accounting | 💰 | DONE | all 4 named artifact(s) on main: apps/backend/src/payroll/driver-settlement.service.ts, scripts/verify-driver-settlement-tenant-scope.mjs, scripts/verify-driver-settlement-uses-bill-not-je.mjs … |
| block-23-escrow-posting-flow | accounting | 💰 | DONE | all 1 named artifact(s) on main: db/migrations/0234_block_23_escrow_posting_flow.sql |
| block-24-factoring-posting | accounting | 💰 | DONE | all 4 named artifact(s) on main: apps/backend/src/accounting/factoring-posting/poster.service.ts, apps/backend/src/accounting/factoring-advances.routes.ts, scripts/verify-factoring-posting-uses-resolver-and-roles.mjs … |
| block-25-factoring-fees-reserves | accounting | 💰 | DONE | all 6 named artifact(s) on main: apps/backend/src/accounting/factoring-fees-posting/poster.service.ts, apps/backend/src/accounting/factoring-advances.routes.ts, apps/frontend/src/pages/accounting/FactorReserveCard.tsx … |
| block-26-factoring-reconciliation | accounting | 💰 | DONE | all 10 named artifact(s) on main: apps/backend/src/accounting/factor-reconciliation/recon.service.ts, apps/backend/src/accounting/factor-reconciliation/routes.ts, apps/backend/src/accounting/index.ts … |
| block-27-fuel-expense-posting | accounting | 💰 | DONE | branch feat/block-27-fuel-expense-posting → PR #203 merged 2026-05-23 |
| block-28-maintenance-ap-posting | accounting | 💰 | DONE | branch feat/block-28-maintenance-ap-posting → PR #205 merged 2026-05-23 |
| block-29-bank-reconciliation-engine | accounting | 💰 | DONE | branch feat/block-29-bank-reconciliation-engine → PR #206 merged 2026-05-23 |
| block-30-bank-reconciliation-ui | accounting | 💰 | DONE | all 10 named artifact(s) on main: apps/backend/src/accounting/bank-recon/recon-worklist.service.ts, apps/backend/src/accounting/bank-recon/recon-worklist.routes.ts, apps/backend/src/accounting/bank-recon/match.service.ts … |
| block-31-sales-tax-handling | accounting | 💰 | DONE | all 10 named artifact(s) on main: apps/backend/src/accounting/posting-engine.service.ts, apps/backend/src/accounting/sales-tax/routes.ts, apps/backend/src/accounting/index.ts … |
| block-33-invoice-line-revenue-mapping | accounting | 💰 | DONE | branch feat/block-33-invoice-line-revenue-mapping → PR #209 merged 2026-05-23 |
| block-34-payment-application | accounting | 💰 | DONE | all 7 named artifact(s) on main: apps/backend/src/accounting/payments/apply.service.ts, apps/backend/src/accounting/payment-applications.routes.ts, apps/frontend/src/pages/accounting/PaymentApplyModal.tsx … |
| block-35-chart-of-accounts-roles | accounting | 💰 | DONE | all 6 named artifact(s) on main: apps/backend/src/accounting/coa-roles/resolver.service.ts, apps/backend/src/accounting/coa-roles/routes.ts, apps/frontend/src/pages/accounting/CoaRolesPage.tsx … |
| block-36-multi-entity-accounting | accounting | 💰 | DONE | all 9 named artifact(s) on main: apps/backend/src/accounting/multi-entity/routes.ts, apps/backend/src/accounting/index.ts, apps/frontend/src/pages/accounting/MultiEntityAccountingPage.tsx … |
| block-41-posting-lineage-ui | accounting | 💰 | DONE | all 5 named artifact(s) on main: apps/frontend/src/pages/accounting/PostingLineagePage.tsx, apps/frontend/src/App.tsx, apps/frontend/src/pages/accounting/AccountingSubNav.tsx … |
| block-43-live-db-schema-verification | accounting | 💰 | DONE | all 2 named artifact(s) on main: scripts/verify-live-db-schema-script-wiring.mjs, scripts/verify-architectural-design.ts |
| block-cf-cash-forecast | accounting | 💰 | DONE | all 2 named artifact(s) on main: scripts/verify-cash-forecast-tenant-scope.mjs, db/migrations/0235_block_cf_cash_forecast_settings.sql |
| block-cmc-month-close-wizard | accounting | 💰 | DONE | all 1 named artifact(s) on main: scripts/verify-month-close-requires-checklist-complete.mjs |
| block-ppc-period-comparison | accounting | 💰 | DONE | all 1 named artifact(s) on main: scripts/verify-comparison-respects-basis.mjs |
| gap-37-equipment-dual-confirm-transfer | gap-spec |  | DONE | all 5 named artifact(s) on main: apps/backend/src/dispatch/equipment-transfer/request.service.ts, apps/backend/src/dispatch/equipment-transfer/dual-confirm.service.ts, apps/backend/src/dispatch/equipment-transfer/routes.ts … |
| gap-65-owner-todays-attention | gap-spec |  | DONE | all 10 named artifact(s) on main: apps/backend/src/owner/todays-attention/aggregator.service.ts, apps/backend/src/owner/todays-attention/routes.ts, apps/backend/src/jobs/todays-attention-worker.ts … |
| gap-68-safety-officer-home-view | gap-spec |  | DONE | all 7 named artifact(s) on main: apps/frontend/src/pages/home/roles/SafetyHome.tsx, apps/frontend/src/components/home/SafetyKpiBar.tsx, apps/frontend/src/components/home/SafetyAlertsPanel.tsx … |
| gap-69-driver-manager-home-view | gap-spec |  | DONE | all 7 named artifact(s) on main: apps/frontend/src/pages/home/roles/DriverManagerHome.tsx, apps/frontend/src/components/home/DriverManagerKpiBar.tsx, apps/frontend/src/components/home/DriverManagerAttentionPanel.tsx … |
| gap-81-drug-alcohol-program | gap-spec |  | DONE | all 3 named artifact(s) on main: apps/backend/src/jobs/da-random-pool-draw-worker.ts, apps/backend/src/index.ts, scripts/verify-drug-alcohol-program.mjs |
| gap-87-audit-log-viewer | gap-spec |  | DONE | all 6 named artifact(s) on main: apps/backend/src/audit/viewer/service.ts, apps/backend/src/audit/viewer/routes.ts, apps/frontend/src/pages/admin/audit-log/AuditLogViewer.tsx … |
| BLOCK-J-MASTER-DATA-GRANT | .block-ready |  | NEEDS-VERIFY | PARTIAL 4/5 artifact(s) on main: scripts/verify-migration-filenames.mjs, db/migrations/202606072230_grant_master_data_schema_to_app.sql |
| block-37-qbo-sync-repair-pipeline | accounting | 💰 | NEEDS-VERIFY | PR #226 title-match only ("fix(accounting): harden Block-37 QBO sync repair p"), no artifact |
| block-40-accounting-audit-trail | accounting | 💰 | NEEDS-VERIFY | PR #227 title-match only ("feat(accounting): implement Block-40 accounting au"), no artifact |
| BLOCK-04-of-29-TIER2-RATE-LIMIT | enterprise-29 |  | NEEDS-VERIFY | PR #1189 title-match only ("feat(dispatch): mandatory Trip Type (NB/TR/SB) + t"), no artifact |
| BLOCK-05-of-29-TIER2-CIRCUIT-BREAKERS | enterprise-29 |  | NEEDS-VERIFY | PR #1192 title-match only ("feat(dispatch): Trip Pairing Board page (Block 05 "), no artifact |
| BLOCK-06-of-29-TIER2-OUTBOX-DLQ | enterprise-29 |  | NEEDS-VERIFY | PR #1196 title-match only ("feat(dispatch): full load PATCH — money/evidence-g"), no artifact |
| BLOCK-08-of-29-TIER2-LOAD-TEST | enterprise-29 |  | NEEDS-VERIFY | PR #796 title-match only ("feat: implement BLOCK-08 tier2 load-test baseline"), no artifact |
| BLOCK-09-of-29-TIER2-E2E-PATHS | enterprise-29 |  | NEEDS-VERIFY | PR #802 title-match only ("feat(tier2): BLOCK-09 critical path E2E tests"), no artifact |
| BLOCK-10-of-29-TIER2-RLS-TEST-GATE | enterprise-29 |  | NEEDS-VERIFY | PR #1224 title-match only ("[GATED — needs Jorge OK] migration: mdata.drivers."), no artifact |
| BLOCK-11-of-29-TIER2-AUDIT-COVERAGE | enterprise-29 |  | NEEDS-VERIFY | PR #814 title-match only ("feat(accounting): seed periods Jan–Jun 2026 for TR"), no artifact |
| BLOCK-13-of-29-TIER2-TUNING-CATALOG | enterprise-29 |  | NEEDS-VERIFY | PR #794 title-match only ("feat(tier2): BLOCK-13 operational tuning catalog"), no artifact |
| BLOCK-14-of-29-TIER2.5-MEXICO-OPS | enterprise-29 |  | NEEDS-VERIFY | PR #804 title-match only ("feat(dispatch): TIER14-MEXICO-OPS Block 14 — Mexic"), no artifact |
| BLOCK-15-of-29-TIER2.5-MECHANIC-SHOP | enterprise-29 |  | NEEDS-VERIFY | PR #805 title-match only ("feat(dispatch): TIER15-MECHANIC-SHOP Block 15 — In"), no artifact |
| BLOCK-16-of-29-TIER2.5-FUEL-CARD | enterprise-29 |  | NEEDS-VERIFY | PR #701 title-match only ("feat(compliance): Block 16 — Compliance Dashboard"), no artifact |
| BLOCK-20-of-29-TIER3-SECRETS-ROTATION | enterprise-29 |  | NEEDS-VERIFY | PR #806 title-match only ("feat(dispatch): TIER20-SECRETS-ROTATION Block 20 —"), no artifact |
| BLOCK-21-of-29-TIER3-DR-DRILL | enterprise-29 |  | NEEDS-VERIFY | PR #807 title-match only ("feat(dispatch): TIER21-DR-DRILL Block 21 — DR Rest"), no artifact |
| BLOCK-22-of-29-TIER3-OPS-RUNBOOKS | enterprise-29 |  | NEEDS-VERIFY | PR #241 title-match only ("feat(payroll): driver settlement engine (Block-22)"), no artifact |
| BLOCK-23-of-29-TIER3-DEGRADATION | enterprise-29 |  | NEEDS-VERIFY | PR #808 title-match only ("feat(dispatch): TIER23-DEGRADATION Block 23 — Degr"), no artifact |
| BLOCK-26-of-29-TIER4-PARTITION | enterprise-29 |  | NEEDS-VERIFY | PR #809 title-match only ("feat(dispatch): TIER26-PARTITION Block 26 — Partit"), no artifact |
| BLOCK-27-of-29-TIER4-CANARY | enterprise-29 |  | NEEDS-VERIFY | PR #810 title-match only ("feat(dispatch): TIER27-CANARY Block 27 — Canary De"), no artifact |
| BLOCK-28-of-29-TIER4-VENDOR-LOCKIN | enterprise-29 |  | NEEDS-VERIFY | PR #811 title-match only ("feat(dispatch): TIER28-VENDOR-LOCKIN Block 28 — Ve"), no artifact |
| BLOCK-29-of-29-TIER4-KNOWN-LIMITATIONS | enterprise-29 |  | NEEDS-VERIFY | PR #813 title-match only ("feat(dispatch): TIER29-KNOWN-LIMITATIONS Block 29 "), no artifact |
| gap-54-wf-051-250-foot-correction | gap-spec |  | NEEDS-VERIFY | PR #775 title-match only ("feat(gap-54): WF-051 250-foot arrival prompt corre"), no artifact |
| gap-67-accounting-home-view | gap-spec |  | NEEDS-VERIFY | PR #652 title-match only ("feat(home): GAP-67 read-only Accounting Home for A"), no artifact |
| AF-0-rebaseline | program | 💰 | NEEDS-VERIFY | PR #1264 title-match only ("docs(accounting): AUTO-19 (AF-0) — accounting re-b"), no artifact |
| AF-1-entity-coa-fix | program | 💰 | NEEDS-VERIFY | PR #530 title-match only ("feat(audit-fix): AUDIT-FIX-2 column resize framewo"), no artifact |
| AF-2-qbo-drift | program | 💰 | NEEDS-VERIFY | PR #532 title-match only ("feat(audit-fix): AUDIT-FIX-4 responsive breakpoint"), no artifact |
| AF-3-account-registers | program | 💰 | NEEDS-VERIFY | PR #534 title-match only ("feat(audit-fix): AUDIT-FIX-6 route enumeration CI "), no artifact |
| AF-4-ap-bills-migration | program | 💰 | NEEDS-VERIFY | PR #536 title-match only ("feat(audit-fix): AUDIT-FIX-8 WO category wire comp"), no artifact |
| AF-6-finance-hub | program | 💰 | NEEDS-VERIFY | PR #540 title-match only ("feat(audit-fix): AUDIT-FIX-15 status bar compact a"), no artifact |
| AF-7-money-controls | program | 💰 | NEEDS-VERIFY | PR #542 title-match only ("feat(audit-fix): AUDIT-FIX-13 customers/vendors pa"), no artifact |
| AF-8-payroll-bridge | program | 💰 | NEEDS-VERIFY | PR #544 title-match only ("feat(audit-fix): AUDIT-FIX-17 factoring power-user"), no artifact |
| CHAIN-01-vendor-picker-fix | program | 💰 | NEEDS-VERIFY | PR #1262 title-match only ("fix(accounting): AUTO-17 (CHAIN-01) — Create-Bill "), no artifact |
| CHAIN-03-create-bill-gl-autopost | program | 💰 | NEEDS-VERIFY | PR #1300 title-match only ("Feat/chain 03 bill gl step2"), no artifact |
| CHAIN-04-bill-payment-tieout | program | 💰 | NEEDS-VERIFY | PR #1267 title-match only ("[HOLD-FOR-JORGE — TIER 1] HOLD-02 (CHAIN-04) — Bil"), no artifact |
| CHAIN-05-bank-feed-live-proof | program | 💰 | NEEDS-VERIFY | PR #1268 title-match only ("[HOLD-FOR-JORGE — TIER 1] HOLD-03 (CHAIN-05) — ban"), no artifact |
| CHAIN-06-invoice-ar-chain-proof | program | 💰 | NEEDS-VERIFY | PR #1269 title-match only ("[HOLD-FOR-JORGE — TIER 1] HOLD-04 (CHAIN-06) — Inv"), no artifact |
| CHAIN-07-settlements-500-fix | program | 💰 | NEEDS-VERIFY | PR #1270 title-match only ("[HOLD-FOR-JORGE — TIER 1] HOLD-05 (CHAIN-07) — set"), no artifact |
| CAP-AUTOSTATUS | program |  | PENDING | forward spec, 0 named artifacts on main (docs/blocks/CAP-AUTOSTATUS.txt) |
| CAP-CARGOTEMP | program |  | PENDING | forward spec, 0 named artifacts on main (docs/blocks/CAP-CARGOTEMP.txt) |
| CAP-ENGINEWO | program |  | PENDING | forward spec, 0 named artifacts on main (docs/blocks/CAP-ENGINEWO.txt) |
| CAP-FUELFRAUD | program |  | PENDING | forward spec, 0 named artifacts on main (docs/blocks/CAP-FUELFRAUD.txt) |
| CAP-GPS | program |  | PENDING | forward spec, 0 named artifacts on main (docs/blocks/CAP-GPS.txt) |
| CAP-PREDICTIVE | program |  | PENDING | forward spec, 0 named artifacts on main (docs/blocks/CAP-PREDICTIVE.txt) |
| CAP-SCORING | program |  | PENDING | forward spec, 0 named artifacts on main (docs/blocks/CAP-SCORING.txt) |
| DISP-KANBAN-dispatch-kanban-board | program |  | PENDING | forward spec, 0 named artifacts on main (docs/blocks/DISP-KANBAN-dispatch-kanban-board.txt) |
| DISP-OVERVIEW-dispatch-overview | program |  | PENDING | forward spec, 0 named artifacts on main (docs/blocks/DISP-OVERVIEW-dispatch-overview.txt) |
| DISP-PROFIT-load-profitability | program |  | PENDING | forward spec, 0 named artifacts on main (docs/blocks/DISP-PROFIT-load-profitability.txt) |
| HOS-VIEWER-DONE | program |  | PENDING | forward spec, 0 named artifacts on main (docs/blocks/HOS-VIEWER-DONE.txt) |
| INS-MODULE | program |  | PENDING | forward spec, 0 named artifacts on main (docs/blocks/INS-MODULE.txt) |
| MNT-SHOP | program |  | PENDING | forward spec, 0 named artifacts on main (docs/blocks/MNT-SHOP.txt) |
| MX-OPS | program |  | PENDING | forward spec, 0 named artifacts on main (docs/blocks/MX-OPS.txt) |
| RPT-MODULE | program |  | PENDING | forward spec, 0 named artifacts on main (docs/blocks/RPT-MODULE.txt) |
| SAFE-W3 | program |  | PENDING | forward spec, 0 named artifacts on main (docs/blocks/SAFE-W3.txt) |
| SAFE-W4 | program |  | PENDING | forward spec, 0 named artifacts on main (docs/blocks/SAFE-W4.txt) |
| SAFE-W5 | program |  | PENDING | forward spec, 0 named artifacts on main (docs/blocks/SAFE-W5.txt) |
| UX-A-table-alignment-DONE | program |  | PENDING | forward spec, 0 named artifacts on main (docs/blocks/UX-A-table-alignment-DONE.txt) |
| CONN-2-factoring-faro | program | 💰 | PENDING (GATED) | forward spec, 0 named artifacts on main (docs/blocks/ACCOUNTING-FINANCE-CONNECTIONS/CONN-2-factoring-faro.txt) |
| CONN-3-relay-internal-bank | program | 💰 | PENDING (GATED) | forward spec, 0 named artifacts on main (docs/blocks/ACCOUNTING-FINANCE-CONNECTIONS/CONN-3-relay-internal-bank.txt) |
| FH-VERIFY-finance-hub-modules | program | 💰 | PENDING (GATED) | forward spec, 0 named artifacts on main (docs/blocks/ACCOUNTING-FINANCE-CONNECTIONS/FH-VERIFY-finance-hub-modules.txt) |
| VOID-VERIFY-void-everywhere | program | 💰 | PENDING (GATED) | forward spec, 0 named artifacts on main (docs/blocks/ACCOUNTING-FINANCE-CONNECTIONS/VOID-VERIFY-void-everywhere.txt) |
