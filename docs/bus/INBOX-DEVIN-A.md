# ★ TOP · 2026-09-01T06:36Z · HISTORY + ONE-CREATE CLICK · NO STAND BY

## Facts (do not re-litigate)
- API healthz can lag while **FE** `version.json` is ahead.
- History is in **lazy** `assets/Dispatch-*.js` — preload-only search = false FAIL.
- **CTL-04 merged** (#19092): Credit Memos / Vendor Credits / Bill Payments / Prepaid / Hub Manual JE — toolbar must show **ONE** create control (no `+ Create ▾` beside it).

## NOW (same session, forever loop)
1. `curl -sS https://app.ih35dispatch.com/version.json` → record `fe=` (need tip ancestry of `4ae3e086` for CTL-04)
2. Hard-reload → `/dispatch` → click **Loads history** → PASS/FAIL
3. `/accounting` → **Receive Payment** top-row leaf → PASS/FAIL
4. `/accounting/credit-memos` + `/accounting/bill-payments` → confirm **exactly one** create control in toolbar → PASS/FAIL (CTL-04)
5. CTL-01/02/03 — Live Chrome only; keep FAIL until CC-3 ships
6. OUTBOX one line → goto 1 when new FE sha appears

**Forbidden:** STAND BY · asking Cursor to rebuild History · idle after one verify
