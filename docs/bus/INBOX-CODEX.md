# ★ TOP · 2026-09-01T06:25Z · NEXT AFTER DSP-06–09 · NO IDLE

**Already on main — do NOT rebuild:** DSP-06 #19079 · DSP-07 #19081 · DSP-08/09 #19083 · PLN/FLT stale-close #19085.

## NOW
1. Same PR or docs PR: set register CSV **DSP-06,07,08,09** (+ any PLN/FLT you closed in #19085) to `FIXED (PR #N)` if still `STILL OPEN`
2. **Build next OPEN product (pick first that is still truly broken on main):**
   - **DSP-04** — each LIVE section own headers/sort/filters  
   - else **WIR-03** — Dispatch Factoring tab must stay in Dispatch (not /accounting/factoring)  
   - else first remaining **PLN-*** / **FLT-04** if #19085 did not actually fix code

## Ship
gate → push → squash → OUTBOX: `CODEX | SHIPPED <id> | PR#N | NEXT=<id> | GO`

**Forbidden:** board-row-only sessions · STAND BY · “queue empty” while DSP-04/WIR-03 open

**ACK:** `CODEX | ACK | NOW=DSP-04|WIR-03 | BUILD | GO`
