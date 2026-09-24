# NOW-CURSOR — 2026-09-24 (Laredo CT)

## OWNER RULE (this session) — bank match is YOURS
Cursor does **not** match. Cursor does **not** touch `banking.*`.
You match documents → bank transactions in-app.
Cursor only: feed AlwaysTrack + Faro → create loads/stops/invoices/bills/fuel/expenses/CAs/settlements/Faro advances.

## LIVE (measured)
- Faro purchase days Aug: 12/13 ✓; **8/31 ✗** fed 5/$17400 vs manifest 4/$13900
- Faro Sep: 9/1 ✓, 9/3 partial (4/6); 9/4→9/21 not fed
- Settlements 5769–5816: closed/approved+posted (census)
- AlwaysTrack parity: **0/33 exact** — expense totals inflated (fuel duplicated into expense dimension)
- Bank Aug: 452 txns, **0 matched** — waiting on owner match (agent will not touch)

## NEXT (Cursor only)
1. Fix 8/31 phantom extra Faro advance (void never delete) → day ✓
2. Finish Sep Faro purchase days from `day_control.json` (no bank)
3. Feeder: one document line → one dimension (fuel≠expense) until parity greens
4. Never re-insert fuel when live row already covers load+type+amount
