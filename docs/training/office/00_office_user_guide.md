# Office user guide — IH35 Dispatch web

Audience: dispatchers, planners, safety, accounting, and leadership using **https://app.ih35dispatch.com** (or your tenant URL). Drivers use the separate PWA—see `docs/training/driver/`.

## How this guide is organized

1. **Operational rhythm** — boards, booking, customers, drivers (`01`–`04`).  
2. **Money movement** — settlements, disputes, accounting hooks (`05`–`07`).  
3. **Efficiency** — keyboard shortcuts (`08`).  

Read modules in numeric order the first time; afterward keep `08_keyboard_shortcuts_reference.md` pinned.

## Roles and expectations

| Role | Primary artifacts | Notes |
|------|-------------------|-------|
| Dispatcher | Loads board, driver comms | Source of truth for status changes |
| Planner | Customer lanes, commitments | Keeps capacity realistic vs. fleet |
| Safety | Exceptions, violations | Uses driver issue intake + safety consoles |
| Accounting | Settlements, AR/AP bridges | Aligns TMS totals with back-office |
| Leadership | KPI snapshots | Read-only or elevated analytics |

## Daily starter checklist

1. Sign in via SSO/Google or corporate IdP as provisioned.  
2. Pick the correct **operating company** / tenant context before editing records.  
3. Open the dispatch board; verify filters match your shift (team, region, status).  
4. Scan exceptions widget / inbound driver notes from overnight hauls.  
5. Confirm integrations health (maps, SMS, accounting exports) via admin banners if shown.

## Deep dives

- Dispatch fundamentals → [01_dispatch_board_basics.md](./01_dispatch_board_basics.md)  
- Tender/book freight → [02_booking_a_load.md](./02_booking_a_load.md)  
- Customer hygiene → [03_managing_customers.md](./03_managing_customers.md)  
- Driver roster actions → [04_managing_drivers.md](./04_managing_drivers.md)  
- Pay cycle expectations → [05_settlement_workflow.md](./05_settlement_workflow.md)  
- Conflict handling → [06_dispute_resolution.md](./06_dispute_resolution.md)  
- Ledger alignment → [07_accounting_basics.md](./07_accounting_basics.md)

## Support path

1. In-app error toast / reference ID (screenshot + UTC timestamp).  
2. Internal `#dispatch-platform` channel with reproduction steps.  
3. Escalate to engineering only after capturing browser console + failing network request.

Keep PHI/financial data out of public tickets—use secure attachment flows approved by your compliance officer.
