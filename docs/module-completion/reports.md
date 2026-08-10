# Module completion — Reports

**PROGRESS: 2 of 8** · complete: `false` · as_of: 2026-08-02 · live_sha: `—`

| Status | Count |
|---|---:|
| PASS | 2 |
| HOLD | 0 |
| OPEN | 6 |
| FAIL | 0 |
| UNVERIFIED | 0 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `RPT-S01` | **PASS** | /reports catalog hub lists 15+ reports across categories honestly | ReportsHome.tsx renders CategoryHoverNav, Accounting+Financial report grid with 12 report links, Management reports grid with 3 report links (15+ total), and KPI summary via getKpiSummary scoped to companyId. Guard: scripts/verify-rpt-s01-s05-reports-home-ifta.mjs. | #5344 |
| `RPT-S02` | **OPEN** | Trial Balance / P&L / Balance Sheet run output ties Neon (Layer B) | scaffold — individual reports UNVERIFIED (not run to Neon tie-out) | — |
| `RPT-S03` | **OPEN** | Settlement Summary report entity-scoped | scaffold — not proven | — |
| `RPT-S04` | **OPEN** | Fuel Reconciliation report ties fuel.fuel_transactions | scaffold — not proven | — |
| `RPT-S05` | **PASS** | IFTA preparer Q3 due banner honest | ReportsHome.tsx renders IftaPreparerCard only after getIftaStatus resolves, with daysUntilDue computed from real status and a loading placeholder of '—'. Guard: scripts/verify-rpt-s01-s05-reports-home-ifta.mjs. | #5344 |
| `RPT-S06` | **OPEN** | Scheduled reports count honest when zero | scaffold — auditor: Scheduled=0, Run-last-7-days=0 | — |
| `RPT-S07` | **OPEN** | Audit reports section (activity, financial change log, deduction trail) | scaffold — routes exist; output UNVERIFIED | — |
| `RPT-VERIFY-01` | **OPEN** | Reports module VERIFY-1..8 TRANSP + USMCA | scaffold — catalog PASS; per-report Layer B UNVERIFIED | — |

Desktop audit: ~/Desktop/IH35-CURSOR-AUDIT/AUDITOR-RUN-2026-07-31/modules/reports-docs-maintenance-2026-08-01.md
