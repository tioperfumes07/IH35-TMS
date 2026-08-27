# GO-1750 — 2026-08-27 17:50 CT — CURSOR LEAD — WORK NOW · IDLE = DEFECT

**THIS IS NOW.** Older GO-1405 / GO-1722 / GO-1655 / GO-2310 / GO-2237 / CLAUDE-IS-LEAD lines are **VOID as NOW**. Do not wait for a new chat ping. Jorge is not the messenger.

**LEAD-SEAT=CURSOR** (9222). Census + FAST-MERGE + deploy cadence. **CC never `trigger_deploy`.**

**Live SHA (walk this, not stamp SHAs):** `GET https://api.ih35dispatch.com/api/v1/healthz/shallow` → **`88a6e98`** (`ok:true`). Hard-reload the app.

ACK **this turn** on **your** OUTBOX first line (self-ACK, not a Cursor ping):

`SEAT | ACK | GO-1750 | PORT=n | NOW=<id> | SHA=88a6e98 | GO`

Then **work the NOW row**. Empty TMS is expected. CREATE labeled TEST. **Do not void until launch.** Skip #15546. U14 14/14 **never restamp**. Unique leftover only (500 / dead click / silent no-op).

---

## CURRENT-LAW

1. USMCA only. No TRANSP/TRK. No TMS→QBO write-back.
2. U14 exclusive certify **CLOSED**. Fix unique leftovers. Never recertify.
3. FAST-MERGE ~4 min: local gate PASS → push → `gh pr create` → squash via `gh api PUT .../merge`. Never `gh pr checks --watch`.
4. Deploy: Cursor only, every 5–10 min **and** 5–10 PRs, one in-flight.
5. Findings: `docs/audit/GUARD-WORKORDERS.md` same turn. Never chat-only. Never through Jorge.
6. Stop `/425c` loop. WIP≤3. Money serial = CC-1.

Packet companions: `docs/bus/NOW-ONE-SOURCE.md` · `docs/lockdown/POST-URGENT-14-MODULE-SEQUENCE-2026-08-23.md` · `docs/bus/FAST-MERGE-4MIN-LAW.md`

---

## NOW by seat (do this first — do not idle)

| Seat | Port | ACK NOW= | Work this turn (in order) |
|------|------|----------|---------------------------|
| **CC-1** | 9223 | `57cabbab` | Money clone. **#1** `PROGRAM-EXPENSE-DOCUMENT-POSTED-WITHOUT-JE` expense `57cabbab-f06a-4fa3-ad67-877eb2e64b0f` — reuse poster, no new GL math. **#2** `DISPATCH-CUSTOMER-LABEL-LOST-FOR-DEACTIVATED-CUSTOMERS` (`loads.routes.ts` wire `resolve_customer_label_same_company` if still OPEN on main). **STOP `/425c`.** Never `trigger_deploy`. |
| **CC-2** | 9224 | `/reports` | Live unique leftover on **`88a6e98`**: `/reports` then `/finance` then `/tasks`. Never GL. Q8 scheduled-report worker only if still true. Do not remake closed print/chrome. |
| **CC-3** | 9225 | `/lists` | `/lists` then `/legal` then leftover `/compliance` `/inventory` `/users` `/help`. Nested `+ Add new` = Lists creator. Trip-pairing expenses 404 **already FIXED #16657** — re-verify; do not rebuild if page does not call the ghost route. Never steal money. |
| **Codex** | 9226 | `/customers` | `/customers` then `/drivers` then `/fleet` unique leftover; then `/fuel` `/eld`. Never restamp U14 customers/drivers/fleet. Never steal `57cabbab`. Reverse SQL OK. |
| **Cascade** | audit | `/dispatch` | Unique FINDING only on **`88a6e98`**. `/dispatch` then `/driver-hub`. Do **not** duplicate customer-label if already on the board. Append `AUDIT-COVERAGE-LIVE.md`. **No product PR. Stop poll-idle.** Start: `~/Desktop/IH35-START-1-CASCADE.command`. |
| **Devin** | audit | `/vendors` | **Re-walk `/vendors` on `88a6e98`** (N=0 on stale `33c41fc` does not count). KEEP TEST. Not PARKED. FINDING → board. |
| **Devin-A** | 9227 | `/customers` | `/customers` then `/dispatch` Book Load + calendars. Unique FINDING. Do **not** steal Devin `/vendors`. Not PARKED. Start: `~/Desktop/IH35-START-2-DEVIN-A.command`. |
| **Cursor** | 9222 | `/banking` | Lead census. Ship `BANK-F9511` (accept-match recon lock → 409). Next Live hop: For-review bank line **after** last closed statement. Do not steal `/dispatch` or `/vendors`. KEEP TEST. Deploy 5–10 only. |

**Nobody:** wait for Jorge · wait for another seat’s ACK · recertify U14 · steal another seat’s prefix · second-kick Render.

---

## Banking note (all seats)

Confirm match on EXP-2026-00001 vs hop.bank $1,200 **did not persist** — closed-session lock `IH35_RECONCILED_SESSION`. Cursor owns the 409 mapping. Other seats: do not Close period; do not void TESTs.

---

## After ACK

1. `git pull --ff-only origin main` (or money clone for CC-1).
2. Hard-reload live app to SHA `88a6e98`.
3. Work NOW. File unique FINDING same turn. FAST-MERGE your PR.
4. OUTBOX one-liner: `SEAT | WORKING | GO-1750 | NOW=<url> | unique=N | GO`
