# 06 — FUEL

**Verdict:** Working import shell; books and IFTA integrity at risk — GL poster never called; Relay siloed.

## Live / repo evidence
- Routes: `/fuel`, planner, inbox, settings, expense-mapping, history, loves-prices, compliance, fraud-alerts.
- Locked tabs (8) ≠ arch Module 5 names (no DEF / in-module IFTA).
- `postFuelExpenseFromEvent` — zero production callers.
- Relay → `integrations.relay_fuel_transactions` only.

## Button / surface inventory
| Surface | Controls | Status |
|---------|----------|--------|
| Home | KPI row, + Plan trip (disabled) | DRIFT |
| History | Import fleet-card CSV, ParityTable, Categorize disabled | PARTIAL |
| Loves prices | Upload prices | HAVE (≠ gallons) |
| Relay inbox | Deposit funding review | DRIFT (not pump txn feed) |
| Expense mapping | Coverage + link to accounting map | HAVE |
| Fraud alerts | List (worker may not boot) | WILL FAIL silent |
| Banking flyout | Fuel Planner dual door | DRIFT |

## HAVE / MISSING / DRIFT / WILL FAIL
**HAVE:** CSV import with unit/driver/load resolve; ParityTable history; Relay deposits.  
**MISSING:** Wire GL poster; Relay→canonical bridge; EntityLink on History; Comdata API; DEF tab; fraud worker.  
**WILL FAIL:** Import OK → P&L empty; Relay-only fleet → empty IFTA; Fuel recon Save link no-op.

## Professional recommendation
Wire poster behind expense-map gate (build-and-HOLD). Bridge Relay into `fuel.fuel_transactions` or union readers. Update Module 5 design to locked tabs or rename UI to design — pick one law.

## Deep button inventory (repo) — 2026-07-15

**Primary surfaces:** `apps/frontend/src/pages/fuel/FuelPlannerHome.tsx` · `FuelHome.tsx` · `FuelTransactionsTable.tsx` · `fraud-alerts/FraudAlertsList.tsx` · routes in `apps/frontend/src/routes/manifest.tsx`

### Tabs / routes
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| Subnav Home/Planner/Relay inbox/Settings/Expense mapping/History & savings/Loves prices/Compliance (8) | `FuelPlannerHome.tsx:40-49,188-192` | URL via `FUEL_TAB_PATH` + `goToTab` | HAVE |
| Route `/fuel/planner` … `/fuel/fraud-alerts` | `routes/manifest.tsx:1223-1279` | Lazy FuelPlannerHome / FraudAlertsList | HAVE |
| Jump to tab dropdown | `FuelPlannerHome.tsx:143-160` | Navigates tab paths | HAVE |
| Fraud alerts (outside 8-tab subnav) | `FuelHome.tsx:33` · `manifest.tsx:1279` | Link `/fuel/fraud-alerts` | HAVE (extra surface) |

### Primary buttons / modals
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| + Plan trip | `FuelPlannerHome.tsx:165-167` | `disabled` + title “no manual trip-create” | STUB (honest) |
| Upload Loves prices | `FuelPlannerHome.tsx:168` | Opens `UploadLovesPricesModal` | HAVE |
| Send to driver app | `FuelPlannerHome.tsx:169-181` | `sendFuelRecommendationToDriver` | HAVE |
| Import Fuel Transactions | `FuelPlannerHome.tsx:243` · `ImportFuelTransactionsModal.tsx:45-73` | CSV import modal | HAVE |
| Relay history Import | `RelayHistoryImport.tsx:49-53` | Owner backfill trigger | HAVE |
| Relay deposit review actions | `RelayDepositReview.tsx` | Card add/deactivate | HAVE (deposit silo) |
| History Export CSV | `FuelTransactionsTable.tsx:73-85` | Client CSV | HAVE |
| History Categorize | `FuelTransactionsTable.tsx:86-94` | `disabled` + toast “not available yet” | STUB |
| Fraud Investigate / Confirm / Dismiss | `FraudAlertsList.tsx:120-127` | API mutations | HAVE (UI) |
| Expense mapping coverage | `FuelPlannerHome.tsx:216-219` · `FuelGlMappingCoverage.tsx` | Read-only coverage | HAVE |
| Fuel recon “Save link” | `reports/FuelReconciliationPage.tsx:283-290` | Closes modal only — no API | WILL FAIL |

### Dead / connectivity
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| `postFuelExpenseFromEvent` | `apps/backend/.../poster.service.ts:223` | Definition + tests only; zero prod callers | WILL FAIL (books empty after import) |
| History driver/unit/load columns | `FuelTransactionsTable.tsx:97-103` | Plain text names — no `EntityLink` | MISSING |
| Active trip Load # | `ActiveTripStrip.tsx:12` | `EntityLink kind="load"` | HAVE |
| Banking flyout “Fuel Planner” | `sidebar-config.ts:176` | → `/fuel` | DRIFT (dual door — KEEP) |
| Relay → `fuel.fuel_transactions` bridge | UNVERIFIED in FE | Inbox is deposit review only | DRIFT / UNVERIFIED bridge |

### Top WILL FAIL (new evidence)
1. **Import succeeds → P&L can stay empty** — GL poster `postFuelExpenseFromEvent` has no production caller (backend definition only).
2. **Fuel recon Save link is a no-op** — `FuelReconciliationPage.tsx:283-290` clears note/closes modal with no persist.
3. **History Categorize is disabled** — `FuelTransactionsTable.tsx:86-94`; operators cannot categorize from the table.

## Live evidence (2026-07-15, app.ih35dispatch.com/fuel)
Verified live tabs: Home · Planner · Relay inbox · Settings · Expense mapping · History & savings · Loves prices · Compliance · Open Fraud Alerts (0). Header: + Create, Tasks, Program Board, QBO sync · Stale. Plan-trip CTA not visible on Home snapshot (Import Months spinner present). Sidebar shows 29 modules including DRIVER HUB, DRIVER PROFILE, FINANCE HUB, 425C, USERS, HELP.
