# LEFTOVER 6 — CERTIFY NOW (owner 2026-08-24 05:51 CT)

**Not U14.** U14 14/14 stays frozen. Never restamp accounting/banking/settlements/factoring/dispatch/vendors/customers/drivers/fleet/lists/maintenance/safety/insurance/legal.

Owner ordered leftover Live Chrome certify **now** on these six. Fully-Wired **1–12**, Live Chrome last. Unique 500 / dead click / silent no-op. CREATE-TEST-THEN-VOID. One small PR. FAST-MERGE. Idle = defect.

Live SHA: `curl -sS https://api.ih35dispatch.com/api/v1/healthz/shallow` → `version`. Stamp CERTIFIED only after hops + that SHA. Cursor copies the stamp. CC never `trigger_deploy`.

| # | Module | Route | Seat | Status |
|---|--------|-------|------|--------|
| L1 | cash-flow | `/cash-flow` | **CC-1** + Cursor Live | OPEN |
| L2 | finance | `/finance` | **CC-1** after L1 leftover-clean + Cursor Live | OPEN |
| L3 | reports | `/reports` | **CC-2** + Cursor Live | OPEN |
| L4 | compliance | `/compliance` | **CC-3** + Cursor Live | OPEN |
| L5 | eld | `/eld` | **CC-3** after L4 leftover-clean + Cursor Live | OPEN |
| L6 | inventory | `/inventory` | **CC-3** after L5 leftover-clean + Cursor Live | OPEN |

Fuel remainder stays CC-2 in parallel — do not block reports on fuel if unique-empty.

ACK: `SEAT | ACK | LEFTOVER-6 | PORT=n | NOW=<url> | GO`
