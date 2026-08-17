# LIVE CHROME MODULE PARTITION · 2026-08-17T14:39Z (Cursor lead)

Owner: Box 3 Built **3438/3441** in flight · Box 4 Live **2371/3441** · seats must not re-walk the same module.

**OWNER 2026-08-17:** Live VERIFY = **Cursor + CC-1 + Codex + Devin local-a**. **Cascade = CANCELLED**.

| Seat | Live Chrome modules (USMCA · app.ih35dispatch.com) | Do NOT touch |
|------|-----------------------------------------------------|--------------|
| **Cursor** | `lists` · `safety` · `dispatch` · `fleet` · `fuel` · `maintenance` · `customers` · `vendors` · `drivers` · `docs` · `tasks` · `compliance` | accounting/banking/factoring money Built/Live (CC-1) |
| **Codex** | `insurance` · `legal` · `inventory` · `reports` · `home` · `program` · `system` · `cash-flow` · `form_425` · `finance` (non-money) · `driver-hub` · `users` | CC-1 money cells |
| **CC-1** | **`accounting` · `banking` · `factoring` · `settlements`** + **3 Built floor cells** | Cursor Lists create chrome |
| **Devin local-a** | Live VERIFY assist / money-critical samples after CC-1 ships | code / GL math |
| **Cascade** | — **CANCELLED** — | all Live VERIFY |

**Rules**
1. Claim in OUTBOX before walk: `LIVE CLAIM <module>`
2. PASS lines alone are **not** Box 4 — append `PROD-VERIFIED` + Leaves backticks + scoreboard `--write` + FAST-MERGE
3. Failures → GUARD-WORKORDERS OPEN + OUTBOX same turn
4. Product-wide `Live=BLOCKED` until Built 3441/3441 and Box4 certified
5. Never leave a seat on `awaiting next FO`

Standing queue: `docs/bus/CONTINUOUS-LIVE-NO-STALL.md`
