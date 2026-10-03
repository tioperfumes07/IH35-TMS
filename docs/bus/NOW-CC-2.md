# NOW — CC-2 — ROUND 355 R-2 + KILL-SECOND-SYSTEM WAIT (2026-10-03)

READ FIRST: `docs/bus/00-OWNER-ORDER-2026-10-03-KILL-THE-SECOND-SYSTEM.md`
THEN: `docs/bus/10-03-2026-ALL-SEATS-ROUND-355-THREE-RULINGS-CLOSED.md`

## YOUR QUEUE RIGHT NOW (ordered)

1. **R-2 — Fuel cap is GALLONS from the unit's own tank** (POLICY — STAYS, finish it)
   - `mdata.units.fuel_tank_capacity_gallons` (no lookup table)
   - Policy `per_swipe_gallon_limit` FALLBACK default 150
   - Gallons FIRST: overage = (gallons − limit) × unit price
   - Do not start deletion tables 8–11 until CC-1 table 1 is on tip

2. **THEN tables 8–9** deduction buckets / settlement deductions — KEEP the policy and the line;
   kill `remaining_balance` / `remaining_bal` only.

3. **THEN tables 10–11** faro_reserve_entries running/short-pay balances → 1230.
   KEEP movement rows. Live row count today: 0.

ACK: `CC-2 | ACK KILL-SECOND-SYSTEM WAIT-THEN-8 | GO`

NO seed. NO Chrome. Fix writers. USMCA only.
