# V3 design boards — the spec for every V3 page (owner law 10-23-2026)

Each board is `<Name>.dc.html` (the source) plus `<Name>.png` (rendered at 1440 px, full page).
The live page must match its board. The board is the hybrid the owner approved: the owner's existing data, filters and
columns in the new layout. "Chrome only" reskins are not acceptable.

A page is DONE only when the PR shows the live screenshot next to this PNG, with an element list
(matches / differs + why), every number clickable to its source, gate exit 0, and "new static reds: 0".

| Board | Module / page |
|---|---|
| Accounting, Accounting-Unexpected | Accounting home, Unexpected expenses tab |
| Banking | Banking home |
| CashFlow-Home / -Projected / -ActualVsProjected / -RollingLedger / -Manual | Cash Flow tabs |
| Customers, Vendors | Customers home, Vendors home |
| Dispatch-BookLoad-Modal / -SidePanel / -Spec / -TripType | Book Load wizard |
| Dispatch-TruckPlanner | Truck planner |
| DriverProfile | Driver profile |
| Factoring, Fuel, Insurance, Legal | Module homes |
| Maintenance-Home, Maintenance-InShop | Maintenance |
| Reports, Reports-Viewer-TrialBalance | Reports library, Trial balance viewer |
| Safety-DriverFiles | Safety: driver files |
| Settlements, -Open, -Closed, -Statement, -PreSettlements, -Close, -Company, -Deductions, -CashAdvances, -Escrow, -EscrowRegister | Settlements tabs |

Lead rounds, rulings and the pending register: `docs/bus/lead/` (PENDING-REGISTER.md is updated every round).
