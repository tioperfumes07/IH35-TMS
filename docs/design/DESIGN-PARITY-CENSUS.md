# DESIGN-PARITY-CENSUS

Generated: 2026-11-10T03:37:58.290Z
Source order: ROUND 8.4 UI-F11125 · owner design law · docs/design/v3 (50) · boards (banking, driver-customers-vendors, maintenance, settlements) · approved-screens (13).

## Totals

| Metric | Count |
|---|---:|
| Routes in manifest | 687 |
| Passing (static app-wide rules) | 685 |
| Failing (rule hits on resolved pages) | 2 |
| Unresolved page binding (informational) | 219 |
| v3 .dc.html designs | 50 |
| Board sets | 4 |
| Approved screens | 13 |

## Fail rule hits

| Rule | Hits |
|---|---:|
| coming_soon_stub | 0 |
| status_select_not_multiselect | 0 |
| missing_em_dash_empty | 0 |
| parity_table_without_export_or_gear | 0 |
| missing_design_labels | 2 |
| unresolved_page | 219 |
| v3_kpi_height_unlocked | 0 |

## Per module

| Module | Routes | Passing | Failing | Unresolved |
|---|---:|---:|---:|---:|
| 425c | 2 | 2 | 0 | 0 |
| accounting | 94 | 94 | 0 | 18 |
| admin | 17 | 17 | 0 | 2 |
| api | 1 | 1 | 0 | 0 |
| app | 1 | 1 | 0 | 1 |
| apply | 1 | 1 | 0 | 0 |
| attorney-review | 1 | 1 | 0 | 0 |
| audit | 1 | 1 | 0 | 1 |
| banking | 27 | 27 | 0 | 3 |
| cash-advances | 1 | 1 | 0 | 0 |
| cash-flow | 1 | 1 | 0 | 0 |
| catalogs | 9 | 9 | 0 | 7 |
| coming-soon | 1 | 1 | 0 | 0 |
| compliance | 4 | 4 | 0 | 0 |
| customers | 3 | 3 | 0 | 0 |
| daily-tasks | 1 | 1 | 0 | 0 |
| dev | 2 | 2 | 0 | 1 |
| dispatch | 51 | 51 | 0 | 15 |
| docs | 1 | 1 | 0 | 0 |
| documents | 1 | 1 | 0 | 0 |
| driver | 7 | 7 | 0 | 5 |
| driver-app | 1 | 1 | 0 | 0 |
| driver-finance | 20 | 20 | 0 | 2 |
| driver-hub | 2 | 2 | 0 | 0 |
| drivers | 24 | 24 | 0 | 15 |
| eld | 1 | 1 | 0 | 0 |
| factoring | 35 | 35 | 0 | 28 |
| feed-gate | 2 | 2 | 0 | 0 |
| finance | 13 | 13 | 0 | 1 |
| finance-hub | 1 | 1 | 0 | 1 |
| fleet | 8 | 8 | 0 | 2 |
| form-425c | 1 | 1 | 0 | 1 |
| fuel | 17 | 17 | 0 | 15 |
| help | 4 | 4 | 0 | 0 |
| home | 3 | 3 | 0 | 3 |
| insurance | 2 | 2 | 0 | 0 |
| integrations | 3 | 3 | 0 | 0 |
| inventory | 3 | 3 | 0 | 0 |
| legal | 14 | 14 | 0 | 0 |
| liabilities | 1 | 1 | 0 | 0 |
| lists | 96 | 96 | 0 | 8 |
| loads | 1 | 1 | 0 | 1 |
| login | 3 | 3 | 0 | 0 |
| maintenance | 45 | 43 | 2 | 21 |
| notifications | 1 | 1 | 0 | 0 |
| onboarding | 1 | 1 | 0 | 0 |
| owner-approval | 1 | 1 | 0 | 0 |
| portal | 5 | 5 | 0 | 5 |
| profitability | 1 | 1 | 0 | 0 |
| program | 8 | 8 | 0 | 1 |
| pwa | 1 | 1 | 0 | 0 |
| qbo | 1 | 1 | 0 | 0 |
| reports | 60 | 60 | 0 | 3 |
| root | 1 | 1 | 0 | 1 |
| safety | 57 | 57 | 0 | 56 |
| samsara | 3 | 3 | 0 | 0 |
| settings | 3 | 3 | 0 | 1 |
| settlements | 1 | 1 | 0 | 1 |
| sign | 1 | 1 | 0 | 0 |
| system | 2 | 2 | 0 | 0 |
| tasks | 6 | 6 | 0 | 0 |
| users | 2 | 2 | 0 | 0 |
| vendors | 3 | 3 | 0 | 0 |
| work-orders | 2 | 2 | 0 | 0 |

## Failing routes (static)

| Route | Module | Design source | Page | Fails |
|---|---|---|---|---|
| `/maintenance` | maintenance | v3:Maintenance-Home.dc.html + approved:02-maintenance.png + board:maintenance | apps/frontend/src/pages/maintenance/MaintenanceHome.tsx | missing_design_labels:OVERHEAD DOOR |
| `/maintenance/fleet-table` | maintenance | v3:Maintenance-Home.dc.html + approved:02-maintenance.png + board:maintenance | — | unresolved_page, missing_design_labels:OVERHEAD DOOR |

## Notes

- A route PASSes this census when the static app-wide rules above hold on its resolved page source.
- Element-level FULL design coverage (every tab/KPI/column vs its .dc.html) is the BUILD phase (one PR per module); this census is the ratchet floor.
- `failing_routes` in scripts/design-parity-census-baseline.json may only go down (`--lower`).
