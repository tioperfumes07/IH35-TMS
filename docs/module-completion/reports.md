# Module completion — Reports

**PROGRESS: 5 of 8** · complete: `false` · as_of: 2026-08-09 · live_sha: `—`

| Status | Count |
|---|---:|
| PASS | 5 |
| HOLD | 0 |
| OPEN | 3 |
| FAIL | 0 |
| UNVERIFIED | 0 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `RPT-S01` | **PASS** | /reports catalog hub lists 15+ reports across categories honestly | ReportsHome.tsx renders CategoryHoverNav, Accounting+Financial report grid with 12 report links, Management reports grid with 3 report links (15+ total), and KPI summary via getKpiSummary scoped to companyId. Guard: scripts/verify-rpt-s01-s05-reports-home-ifta.mjs. | #5344 |
| `RPT-S02` | **OPEN** | Trial Balance / P&L / Balance Sheet run output ties Neon (Layer B) | scaffold — individual reports UNVERIFIED (not run to Neon tie-out) | — |
| `RPT-S03` | **PASS** | Settlement Summary report entity-scoped | SettlementSummaryPage.tsx uses useCompanyContext selectedCompanyId, gates the query on companyId, and calls getSettlementSummary({ operating_company_id }). FE api withCompany(/api/v1/reports/settlement-summary). BE settlement-summary.routes.ts uses companyQuerySchema + withCompanyScope and SQL s.operating_company_id = $1 / d.operating_company_id = $1 on driver_finance.driver_settlements. Guard: scripts/verify-rpt-s03-settlement-summary.mjs. | #5347 |
| `RPT-S04` | **OPEN** | Fuel Reconciliation report ties fuel.fuel_transactions | scaffold — not proven | — |
| `RPT-S05` | **PASS** | IFTA preparer Q3 due banner honest | ReportsHome.tsx renders IftaPreparerCard only after getIftaStatus resolves, with daysUntilDue computed from real status and a loading placeholder of '—'. Guard: scripts/verify-rpt-s01-s05-reports-home-ifta.mjs. | #5344 |
| `RPT-S06` | **PASS** | Scheduled reports count honest when zero | ReportsHome kpiReady —/0 honesty; SubscriptionManager emptyMessage; ScheduledReportsPanel No active schedules; verify-rpt-s06-scheduled-honest-zero.mjs | #5351 |
| `RPT-S07` | **PASS** | Audit reports section (activity, financial change log, deduction trail) | ReportsSubNav AUDIT_REPORT_CHILDREN + 7 manifest routes + AuditReportPage company scope; verify-rpt-s07-audit-reports-section.mjs | PENDING |
| `RPT-VERIFY-01` | **OPEN** | Reports module VERIFY-1..8 TRANSP + USMCA | scaffold — catalog PASS; per-report Layer B UNVERIFIED | — |

Desktop audit: ~/Desktop/IH35-CURSOR-AUDIT/AUDITOR-RUN-2026-07-31/modules/reports-docs-maintenance-2026-08-01.md
