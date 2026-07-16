# 23 — CASH FLOW + FINANCE HUB

**Verdict:** Both modules are present and sidebar-visible. Cash Flow is a forward-looking prediction UI (2–3 tabs, one flag-gated). Finance Hub is a read-only KPI dashboard behind `FINANCE_HUB_UI_ENABLED` (default OFF) while Overview/Projections/Scenarios remain reachable — loan tools flag-gated. Distinct from Banking reconcile and Reports cash-flow statements.

## Live evidence notes
**REPO-ONLY.**
- Sidebar CASH FLOW → `/cash-flow` (L125); FINANCE HUB → `/finance/hub` (L127–129)
- Cash Flow: `CashFlowPage.tsx` tabs Projected (Auto) / Actual vs Projected / Manual Daily Projections (flag)
- Finance: `FinanceModuleTabs.tsx` Overview/Projections/Scenarios/Hub/Statements/AR-AP + flag tabs Loan/Calculator/Amortization/Break-Even
- Finance Hub: `FinanceHubPage.tsx` gated by `FINANCE_HUB_UI_FLAG`
- Flyout finance L278–291 includes Loan Wizard/Calculator/Amortization even when tabs flag-off
- Alias `/finance-hub` → `/finance/hub`

## Surface / button inventory

### Cash Flow (`/cash-flow`)

| Surface | Control | Route/behavior | Status |
|---------|---------|----------------|--------|
| Sidebar CASH FLOW | Nav | `/cash-flow` | HAVE |
| Tabs | Projected (Auto) | `DailyPredictionTab` | HAVE |
| Tabs | Actual vs Projected | `ActualVsProjectedTab` | HAVE |
| Tabs | Manual Daily Projections | Only if `CASH_FORECAST_ENABLED_FLAG` | HAVE (gated) |
| Header | Primary create CTA | None | MISSING (read/forecast module — OK if honest) |
| Company gate | Select company message | | HAVE |

### Finance Hub / Finance module

| Surface | Control | Route/behavior | Status |
|---------|---------|----------------|--------|
| Sidebar FINANCE HUB | Nav | `/finance/hub` | HAVE |
| Module tabs | Overview `/finance` | | HAVE |
| Module tabs | Projections / Scenarios | | HAVE |
| Module tabs | Hub | Flag-gated body | HAVE door / MAY FAIL content if flag off |
| Module tabs | Statements / AR/AP Aging | | HAVE |
| Module tabs | Loan Wizard / Calculator / Amortization / Break-Even | Feature flags | HAVE (gated) |
| Hub KPI cards | Whole-card Link | `kpi.drill_to` existing routes | HAVE when enabled |
| Hub disabled state | Honest flag message | Shows code name | HAVE (honest) |
| Flyout | Loan Wizard etc. | Routes always listed | DRIFT vs tab visibility when flag off |

## Connectivity to money/ops
- Finance Hub explicitly posts nothing — drills to accounting/banking/reports.
- Cash Flow predictions should consume AR/AP/bank reality — verify tabs use live company data (not fixtures in prod).
- Overlap with `/reports/cash-flow-statement` and `/reports/cash-flow-overview` — three “cash flow” doors (module + 2 reports). Keep all; clarify labels.

## HAVE / MISSING / DRIFT / WILL FAIL
**HAVE:** Both sidebar entries; Cash Flow tabs; Finance module tab bar; honest flag-off Hub; AR/AP aging with EntityLink invoices.
**MISSING:** Unified owner story in arch design for Cash Flow vs Finance Hub vs Reports cash statements.
**DRIFT:** Flyout shows loan tools when flags hide tabs; Hub landing can be empty while Overview works.
**WILL FAIL:** Operators open FINANCE HUB with flag off → see disabled wall and assume module broken; flyout Loan Wizard may show disabled page without explanation matching flyout.

## Professional recommendation
Keep Cash Flow and Finance Hub (never delete). Either enable Hub flag for TRANSP when KPI API is proven, or change sidebar landing to `/finance` Overview until Hub is on — do not remove Hub route. Align flyout with flag-visible tabs (hide or badge “flag off”). Document the three cash-flow surfaces in Help/runbook. No money posting from these modules without explicit Owner-locked flags.

## Deep button inventory (repo) — finish pass 2026-07-15

**Evidence root:** `apps/frontend/src/pages/cash-flow/` · `apps/frontend/src/pages/finance/` · sidebar `sidebar-config.ts:125,127-129,278-290`

### Cash Flow (`/cash-flow`)
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| Sidebar CASH FLOW | `sidebar-config.ts:125` | `/cash-flow` | HAVE |
| Tabs (client state) | `CashFlowPage.tsx:15,19-23,43-46` | `useState` — **no URL tab** | WILL FAIL bookmark |
| Projected (Auto) | `CashFlowPage.tsx:20,48-49` | `DailyPredictionTab` | HAVE |
| Actual vs Projected | `CashFlowPage.tsx:21,51-52` | `ActualVsProjectedTab` | HAVE |
| Manual Daily Projections | `CashFlowPage.tsx:18,22,54-55` | Only if `CASH_FORECAST_ENABLED_FLAG` | HAVE (gated) / STUB when off |
| Company gate | `CashFlowPage.tsx:25-34` | Select company | HAVE |
| Primary create CTA | None on header | Read/forecast module | MISSING (OK if honest) |

### Finance module tabs
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| Sidebar FINANCE HUB | `sidebar-config.ts:129` | Lands `/finance/hub` | HAVE |
| Always-on tabs | `FinanceModuleTabs.tsx:15-20` | Overview / Projections / Scenarios / Hub / Statements / AR-AP | HAVE |
| Loan / Calculator / Amortization / Break-Even | `FinanceModuleTabs.tsx:28-39` | Flag-gated into tab bar | HAVE (gated) |
| Flyout lists loan tools always | `sidebar-config.ts:288-290` | Routes listed even if tabs hidden | DRIFT |

### Hub / gated pages
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| Hub flag-off wall | `FinanceHubPage.tsx:75-84` | Honest `FINANCE_HUB_UI_FLAG` message | HAVE / WILL FAIL ops trust if default OFF |
| Hub KPI whole-card Link | `FinanceHubPage.tsx:25-38,100-101` | `kpi.drill_to` | HAVE when enabled |
| Loan Wizard preview-only | `LoanWizardPage.tsx:86-93,191` | No post when flag off; preview says posting gated | HAVE / STUB post |
| Amortization **Create + generate schedule** | `AmortizationPage.tsx:92-94` · `createLoan` | Writes loan when flag ON | HAVE (gated money write — Owner flag) |
| Statements Export/Print | `FinancialStatementsPage.tsx:248-269` | CSV + print | HAVE when flag on |
| AR/AP Aging row drill | `ArApAgingPage.tsx:311` | Open invoices/bills | HAVE |

### Three “cash flow” doors (KEEP all)
| Door | Path | Status |
|------|------|--------|
| Cash Flow module | `/cash-flow` | HAVE |
| Reports cash flow statement/overview | Reports subnav | HAVE |
| Finance Statements | `/finance/statements` | HAVE |

### Top WILL FAIL (new evidence)
1. **FINANCE HUB sidebar → flag-off wall** — `FinanceHubPage.tsx:75-84` default OFF.
2. **Flyout Loan Wizard** while tab hidden — `sidebar-config.ts:288` vs `FinanceModuleTabs.tsx:37`.
3. **Cash Flow tab not bookmarkable** — `CashFlowPage.tsx:15` client state only.

**Never delete** Cash Flow, Finance Hub, or Reports cash-flow statements — clarify labels / flags only.
