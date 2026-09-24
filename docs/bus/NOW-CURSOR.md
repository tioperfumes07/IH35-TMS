# NOW-CURSOR — 2026-09-24 (Laredo CT)

## OWNER RULE (this session) — bank match is YOURS
Cursor does **not** match. Cursor does **not** touch `banking.*`.
You match documents → bank transactions in-app.
Cursor only: feed AlwaysTrack + Faro → create loads/stops/invoices/bills/fuel/expenses/CAs/settlements/Faro advances.

## LIVE (measured 2026-09-24)
- **AR tie-out GREEN** — fired revrec earn+bill for invoices 13571 ($4,900) + 13574 ($4,400); gl=sub=$400,706
- **posted_without_posting GREEN** (0)
- **AP tie-out** — local GREEN after health-check includes expense AP credits ($2,976.63 / 60 expenses); needs backend deploy for prod healthz
- Pure-Aug CA **TIE** $1,595.96; escrow **TIE** $875
- Bank Aug: **0 matched** — waiting on owner (agent will not touch)

## NEXT (Cursor only — no banking)
1. Company-expense dimension vs ctrl $2,351.19 (fuel≠expense) until AlwaysTrack parity moves
3. Sep Faro purchase days from `day_control.json` (no bank)
4. Never re-insert fuel when live row already covers load+type+amount
