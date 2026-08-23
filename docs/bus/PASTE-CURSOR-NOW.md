===== CURSOR 9222 =====
LOOP docs/bus/LOOP-U14-CERTIFY-THEN-LEFTOVER.md
curl -sS https://api.ih35dispatch.com/api/v1/healthz/shallow
Stamp AT MOST ONE OPEN U14 row when seat OUTBOX has CERTIFIED | MODULE=<id> AND LIVE_SHA equals this curl. Never recertify 1–6 11–13 lists legal.
OPEN = customers then drivers then fleet (Codex reverse). Leftover https://app.ih35dispatch.com/425c unique 500/dead/silent. FAST-MERGE. Never idle.
ACK: Cursor | ACK | URGENT-14-EXCLUSIVE | PORT=9222 | MODULE=425c | NOW=stamp Codex customers the second OUTBOX matches bd67370 | GO
===== END =====
