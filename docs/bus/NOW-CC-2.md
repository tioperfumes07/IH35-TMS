# NOW — CC-2 — ROUND 355 (2026-10-03)

READ FIRST: `docs/bus/10-03-2026-ALL-SEATS-ROUND-355-THREE-RULINGS-CLOSED.md`

## YOUR QUEUE RIGHT NOW (ordered)

1. **R-2 — Fuel cap is GALLONS from the unit's own tank** (OWNER RULED — never ask again)
   - Add/use `mdata.units.fuel_tank_capacity_gallons` (no lookup table)
   - Policy `per_swipe_gallon_limit` FALLBACK default 150
   - Gallons FIRST: overage = (gallons − limit) × unit price
   - `per_transaction_limit_cents` last fallback when no gallons
   - Refuse active policy with neither limit
   - Non-fuel on fuel card = full recover (except repairs/authorized)
   - Receivable 1250, never Cash Advance. Approve-then-recover + signed contract stand
   - SAME package as F-3 Relay Fuel Wallet −$33,839.80 — one engine, one report
   - Claim migration; Cursor HH 12–23 authors if you need a lane handoff — do NOT wait idle

PROOF: large-tank + small-tank unit, same gallons, correct overage each.

2. Continue ROUND 352 F-2/F-3 claim `202615330600` after R-2 is DONE.

ACK: append to OUTBOX-CC-2: `CC-2 | ACK ROUND 355 R-2 | GO`

NO seed. NO Chrome. Fix writers. USMCA only.
