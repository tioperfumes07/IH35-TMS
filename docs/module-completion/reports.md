# Module completion — Reports

**PROGRESS: 7 of 8** · complete: `false` · as_of: 2026-08-09 · live_sha: `—`

| Status | Count |
|---|---:|
| PASS | 7 |
| HOLD | 0 |
| OPEN | 1 |
| FAIL | 0 |
| UNVERIFIED | 0 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `RPT-S01` | **PASS** | /reports catalog hub lists 15+ reports across categories honestly | ReportsHome.tsx renders CategoryHoverNav, Accounting+Financial report grid with 12 report links, Management reports grid with 3 report links (15+ total), and KPI summary via getKpiSummary scoped to companyId. Guard: scripts/verify-rpt-s01-s05-reports-home-ifta.mjs. | #5344 |
| `RPT-S02` | **PASS** | Trial Balance / P&L / Balance Sheet run output ties Neon (Layer B) | Neon prod br-fancy-credit-akjnd07a lucia bypass 2026-08-09: TRANSP TB debits=credits=1162830756c balanced; P&L net_income=-67322866c; BS as_of 2026-08-03 assets=liab+equity+cye. USMCA TB debits=credits=6000059c balanced; P&L net_income=74100c; BS as_of 2026-08-09 assets=625990c=liab+equity+cye. Service SQL mirrors JEP aggregates (presentation-layer AR/liability widgets are separate). Guard: scripts/verify-rpt-s02-neon-tie.mjs. | PENDING |
| `RPT-S03` | **PASS** | Settlement Summary report entity-scoped | SettlementSummaryPage.tsx uses useCompanyContext selectedCompanyId, gates the query on companyId, and calls getSettlementSummary({ operating_company_id }). FE api withCompany(/api/v1/reports/settlement-summary). BE settlement-summary.routes.ts uses companyQuerySchema + withCompanyScope and SQL s.operating_company_id = $1 / d.operating_company_id = $1 on driver_finance.driver_settlements. Guard: scripts/verify-rpt-s03-settlement-summary.mjs. | #5347 |
| `RPT-S04` | **PASS** | Fuel Reconciliation report ties fuel.fuel_transactions | FuelReconciliationPage.tsx uses useCompanyContext selectedCompanyId, gates query on companyId, calls getFuelReconciliation({ operating_company_id }). FE api withCompany(/api/v1/reports/fuel-reconciliation). BE fuel-reconciliation.routes.ts uses companyQuerySchema + withCompanyScope and reads card totals/by-unit/unmatched from fuel.fuel_transactions (ft.operating_company_id = $1, archived_at IS NULL, ROUND(total_cost*100) cents) — not banking.bank_transactions merchant heuristics. Guard: scripts/verify-rpt-s04-fuel-reconciliation.mjs. | #5359 |
| `RPT-S05` | **PASS** | IFTA preparer Q3 due banner honest | ReportsHome.tsx renders IftaPreparerCard only after getIftaStatus resolves, with daysUntilDue computed from real status and a loading placeholder of '—'. Guard: scripts/verify-rpt-s01-s05-reports-home-ifta.mjs. | #5344 |
| `RPT-S06` | **PASS** | Scheduled reports count honest when zero | ReportsHome kpiReady —/0 honesty; SubscriptionManager emptyMessage; ScheduledReportsPanel No active schedules; verify-rpt-s06-scheduled-honest-zero.mjs | #5351 |
| `RPT-S07` | **PASS** | Audit reports section (activity, financial change log, deduction trail) | ReportsSubNav AUDIT_REPORT_CHILDREN + 7 manifest routes + AuditReportPage company scope; verify-rpt-s07-audit-reports-section.mjs | #5353 |
| `RPT-VERIFY-01` | **OPEN** | Reports module VERIFY-1..8 TRANSP + USMCA | scaffold — catalog PASS; per-report Layer B UNVERIFIED | — |

Desktop audit: ~/Desktop/IH35-CURSOR-AUDIT/AUDITOR-RUN-2026-07-31/modules/reports-docs-maintenance-2026-08-01.md
