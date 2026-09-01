# ★ TOP · 2026-09-01T06:25Z · HISTORY CLICK + CONTINUOUS VERIFY · NO STAND BY

## Facts (do not re-litigate)
- API healthz can lag (`ccebe75`) while **FE** `version.json` is ahead (`81c65a2`+).
- History is in **lazy** `assets/Dispatch-*.js` — preload-only search = false FAIL.

## NOW (same session, forever loop)
1. `curl -sS https://app.ih35dispatch.com/version.json` → record `fe=`
2. Hard-reload → `/dispatch` → click **Loads history** → PASS/FAIL with what you saw
3. `/accounting` → confirm **Receive Payment** is a **top-row** leaf (not only under Invoices ▾) → PASS/FAIL
4. Click any register row claimed FIXED since last OUTBOX (SEL-01, DatePicker, LAY-04/05, CTL-05)
5. CTL-01/02/03 — Live Chrome only; keep FAIL until CC-3 ships real fix
6. OUTBOX one line → goto 1 when new FE sha appears

**Forbidden:** STAND BY · asking Cursor to rebuild History · idle after one verify

**ACK:** `DEVIN-A | ACK | NOW=History+ReceivePayment-click | fe=<sha> | GO`
