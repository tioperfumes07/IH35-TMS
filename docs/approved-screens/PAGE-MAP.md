# Approved Screens Page Map

This file is the canonical page-to-design mapping for implementation. The only valid design sources are the approved PNGs in this directory.

| Approved PNG | Live route | Page component file |
|---|---|---|
| `1-HOME_PAGE.png` | `/home` | `apps/frontend/src/pages/home/HomePage.tsx` |
| `2-Maintenance.png` | `/maintenance` | `apps/frontend/src/pages/maintenance/MaintenanceHome.tsx` |
| `3-Accounting-Dropdown.png` | `/accounting` | `apps/frontend/src/pages/accounting/AccountingHubPage.tsx` |
| `4-Banking_Homepage.png` | `/banking` | `apps/frontend/src/pages/banking/BankingHome.tsx` |
| `5-Fuel_Planner.png` | `/fuel` | `apps/frontend/src/pages/fuel/FuelPlannerHome.tsx` |
| `6-Safety.png` | `/safety` | `apps/frontend/src/pages/safety/SafetyLayout.tsx` |
| `7-Drivers.png` | `/drivers` | `apps/frontend/src/pages/Drivers.tsx` |
| `8-Dispatch-Home.png` | `/dispatch` | `apps/frontend/src/pages/Dispatch.tsx` |
| `9-Lists_and_catalogs.png` | `/lists` | `apps/frontend/src/pages/lists/ListsHubPage.tsx` |
| `10-Reports.png` | `/reports` | `apps/frontend/src/pages/reports/ReportsHome.tsx` |
| `11-Form_425-Design.png` | `/425c` | `apps/frontend/src/pages/form425c/Form425CHome.tsx` |

Notes:
- `/form-425c` redirects to `/425c` in routing.
- Any route/component change for a mapped page must be updated in the same PR.
