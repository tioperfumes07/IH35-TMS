# ROUND 8.5 — approved board route map (working inventory)

42 canvas-1 boards + 3 maintenance graphics = 45. Duplicate prefixed repo copies are not additional boards. Old LoadWizard, V2 and PREVIOUS designs are excluded. Routes are source-mapped unless marked candidate; this inventory is NOT live acceptance. All modal/record triggers still require live exercise. IDs below are placeholders, never production IDs.

| # | Approved board (under docs/design/v3) | Route / state / trigger | Evidence status |
|---|---|---|---|
| 1 | Accounting | `/accounting` | Live initial comparison FAIL |
| 2 | Accounting-Unexpected | `/accounting/unexpected` | Source route; live pending |
| 3 | Banking | `/banking` | Live initial comparison FAIL |
| 4 | CashFlow-Home | `/cash-flow?tab=home` | CashFlowPage tab union |
| 5 | CashFlow-Projected | `/cash-flow?tab=daily_prediction` | CashFlowPage tab union |
| 6 | CashFlow-ActualVsProjected | `/cash-flow?tab=actual_vs_projected` | CashFlowPage tab union |
| 7 | CashFlow-RollingLedger | `/cash-flow?tab=rolling_ledger` | CashFlowPage tab union |
| 8 | CashFlow-Manual | `/cash-flow?tab=manual_daily_projections` | CashFlowPage tab union |
| 9 | Customers | `/customers` | Manifest; live pending |
| 10 | Vendors | `/vendors` | Manifest; live pending |
| 11 | DriverProfile | `/drivers/:id` | Manifest; profile tab/record selection pending |
| 12 | Dispatch-TruckPlanner | `/dispatch/planners/truck` | Manifest TruckPlanner binding |
| 13 | Dispatch-LoadHistory | `/dispatch/load-history` | Manifest; live pending |
| 14 | Dispatch-BookLoad-Modal | `/dispatch` → Book load → centered wizard | Candidate trigger; verify exact control |
| 15 | Dispatch-BookLoad-SidePanel | `/dispatch` → Truck Line → unit Book load | Candidate trigger; verify exact view/query |
| 16 | Dispatch-BookLoad-Spec | Same Book load wizard; field sizes/format requirements | Specification overlay, not independent route |
| 17 | Dispatch-BookLoad-TripType | Book load wizard → NB/TR/SB section | Candidate trigger; never submit a load for proof |
| 18 | Factoring | `/factoring/account-summary` | Manifest; determine home/account-summary equivalence live |
| 19 | Fuel | `/fuel/by-truck` and `/fuel` | Both routes exist; board binding needs live resolution |
| 20 | Insurance | `/insurance` | Live initial comparison FAIL |
| 21 | Legal | `/legal` → Contracts | Candidate tab binding; verify live |
| 22 | Maintenance-Home | `/maintenance` | MaintenanceHome binding |
| 23 | Maintenance-InShop | `/maintenance/fleet-table?status=in-shop` | MaintenanceHome.tsx:114–115,169 |
| 24 | Safety-DriverFiles | `/safety/driver-files` | Manifest; live pending |
| 25 | Reports | `/reports` | Manifest; live pending |
| 26 | Reports-Viewer-TrialBalance | `/reports/trial-balance` | Manifest; live pending |
| 27 | Reports-Loads | `/reports/loads` | Manifest; live pending |
| 28 | Reports-DriverSettlements | `/reports/driver-settlements` | Manifest; live pending |
| 29 | Reports-CompanySettlements | `/reports/company-settlements` | Manifest; live pending |
| 30 | Reports-Customers | `/reports/customers` | Manifest; live pending |
| 31 | Reports-Vendors | `/reports/vendors` | Manifest; live pending |
| 32 | Settlements | `/driver-finance/settlements` | Manifest; live pending |
| 33 | Settlements-Open | `/driver-finance/settlements?tab=open` | settlementsSubnav |
| 34 | Settlements-Closed | `/driver-finance/settlements?tab=closed` | settlementsSubnav |
| 35 | Settlements-Statement | `/driver-finance/settlements?settlement_id=:id` | SettlementsPage:131,428–435; record click pending |
| 36 | Settlements-PreSettlements | `/driver-finance/pre-settlements` | Manifest + settlementsSubnav |
| 37 | Settlements-Close | `/driver-finance/settlement-close` | Manifest; open only, never finalize |
| 38 | Settlements-CashAdvances | `/driver-finance/cash-advances` | Manifest + settlementsSubnav |
| 39 | Settlements-Escrow | `/driver-finance/escrow` | Manifest + settlementsSubnav |
| 40 | Settlements-EscrowRegister | `/driver-finance/escrow/:driverId` | settlementsEscrowRegisterHref |
| 41 | Settlements-Deductions | `/driver-finance/deductions` | Manifest + settlementsSubnav |
| 42 | Settlements-Company | `/driver-finance/company-settlements` | Manifest + settlementsSubnav |
| 43 | maintenance-vehicle-graphics/Main | `/maintenance` → Fleet Health Line | Source pin; live graphic pending |
| 44 | maintenance-vehicle-graphics/TruckProfile | `/fleet/units/:id` → truck service map | Source pin; record selection pending |
| 45 | maintenance-vehicle-graphics/ShopBays | `/maintenance/fleet-table?status=in-shop` → InShopBoard | Source pin; live graphic pending |

Open source reconciliation: `Modal-FuelAssignment.dc.html` is an extra root repo board not present among the export's 42 approved V3 entries. Do not silently replace one of the approved 45 with it. Track its approval/scope separately. Several candidate modal bindings must be resolved before calling the map complete.
