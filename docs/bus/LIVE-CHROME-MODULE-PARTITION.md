# LIVE CHROME MODULE PARTITION · 2026-08-16 20:48 CT (Cursor lead)

Owner: Box 3 Built closed · Box 4 Live in flight · seats must not re-walk the same module.

**OWNER 2026-08-16:** Live VERIFY = **Cursor + CC-1 + Codex only**. **Cascade = OFF Live** (FAST-MERGE / poll only).

| Seat | Live Chrome modules (USMCA · app.ih35dispatch.com) | Do NOT touch |
|------|-----------------------------------------------------|--------------|
| **Cursor** | `lists` · `safety` · `dispatch` · `fleet` · `fuel` · `maintenance` · `customers` · `vendors` · `drivers` · `docs` · `tasks` · `compliance` | accounting/banking/factoring money leaves (CC-1) |
| **Codex** | `insurance` · `legal` · `inventory` · `reports` · `home` · `program` · `system` · `cash-flow` · `form_425` · `finance` (non-money) · **`driver-hub` · `users`** (0% Live priority) | CC-1 money leaves |
| **CC-1** | **`accounting` · `banking` · `factoring` · `settlements`** (Box4 0%/low — WAVE-LIVE-MONEY-1) | Cursor Lists create chrome |
| **Cascade** | — none — | all Live VERIFY |

**Rules**
1. Claim in OUTBOX before walk: `LIVE CLAIM <module> · WAVE-…`
2. PASS lines alone are **not** Box 4. Same turn: append `PROD-VERIFIED` to `docs/audit/AUDIT-COVERAGE-LIVE.md` with **Leaves: \`leaf.id\`** (backticks) + VERIFY-1/3/4 keywords + `scoreboard --write` + FAST-MERGE
3. Failures → GUARD-WORKORDERS OPEN + OUTBOX same turn
4. Product-wide `Live=BLOCKED` until certified — per-leaf PASS ≠ product Live
5. If another seat has LIVE CLAIM on a module, skip it
6. **Never leave a seat on `awaiting next FO`** — lead always tips a numbered WAVE with leaf ids

**CC-1 active:** WAVE-LIVE-MONEY-1A accounting → 1B banking → 1C factoring  
**Codex active:** WAVE-LIVE-ZERO-1A driver-hub → 1B users
