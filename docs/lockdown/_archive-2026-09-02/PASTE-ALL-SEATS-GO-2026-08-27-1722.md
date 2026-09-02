# GO-1722 — FINISH LIVE CHROME + UNIQUE FIXES, THEN NEXT HOP · 2026-08-27 17:22 CT

**THIS IS NOW.** Owner: all coders finish Live Chrome verification and unique fixes on your exclusive URLs, then immediately take the next leftover hop. **No idle. Watching INBOX = defect.** Cursor ping ≠ ACK.

Live `GET https://api.ih35dispatch.com/api/v1/healthz/shallow` → **`version` must match your walk**. Packet SHA at write was `33c41fc`. **Walk current healthz — live `88a6e98` after Cursor API deploy.** Hard-reload. Skip **#15546**. **Never restamp U14.** CC never `trigger_deploy`. FAST-MERGE ~4 min. Deploy 5–10 min **and** 5–10 PRs, one API in-flight.

---

## KEEP TEST UNTIL LAUNCH (standing law, not chat-only)

**Every seat has full permission** to create labeled TEST / sample vendors, customers, loads, bills, expenses, invoices, catalog rows, matters, and whatever the wizard needs. You do **not** wait for Jorge to create data. You do **not** stop because a picker is empty — create the TEST row.

**Do not void TEST rows now.** Voiding now is **double work**: those TEST vendors, customers, loads, bills, and related rows are the fixtures for the next hop. **Void and clean once after launch**, one pass. Leave labeled TEST DATA in place. Reuse existing TEST rows instead of remaking.

Companion: `docs/lockdown/CREATE-TEST-THEN-VOID-LAW-2026-08-22.md` item 3 (all seats may create; do not void until launch).

---

## Packet law

`docs/lockdown/FULLY-WIRED-COMPLETE-BAR-2026-08-13.md` items **1–12** (Live Chrome **last**). Meter 3 = current healthz + 1–12 + named unique OPEN **0**. Campaign U14 stamps ≠ meter 3. File unique **500 / dead click / silent no-op** to `docs/audit/GUARD-WORKORDERS.md` same turn. Do not remake proven Close / Book Load / Combobox `loading`.

ACK this turn:

`SEAT | ACK | GO-1722 | PORT=<n> | NOW=<your exclusive URL> | SHA=<healthz> | GO`

When a hop is done:

`METER3-WALK | MODULE=<id> | SHA=<healthz> | N=<unique count> | NEXT=<next URL from YOUR row>`

---

## How to work (every seat, every hop)

1. Curl healthz. If SHA moved, hard-reload. Walk **this** SHA only.
2. Open **your exclusive URL** in **your** debug Chrome (port below). Do not steal another seat's prefix.
3. Click through: nav → tabs → `+ Create` / `+ Book` → save **labeled TEST** → reload → reverse link. Unique 500/dead/silent only.
4. If FINDING: root-cause fix + guard + FAST-MERGE (Cursor EVEN verify-steps; CC-1 ≡1; CC-2 ≡3). Never GL math unless CC-1. Never weaken a guard.
5. **Immediately** start the next URL in **your** sequence. Empty unique N=0 is **not** park. Reuse TEST vendors/customers/loads you (or another seat) already created.
6. QBO **OFF**. TMS posting flags: owner decision already locked; do not flip. No TMS→QBO write-back.
7. **Do not void** TEST rows until the owner's post-launch clean pass.

---

## Exclusive NOW then NEXT (do not steal)

| Seat | Port | Finish first (GO-1655 leftover) | Then NEXT (in order) |
|------|------|----------------------------------|----------------------|
| **Cursor** | 9222 | `/banking` TEST expense Match → recon Accept → ledger; then `/maintenance` → `/safety` → `/insurance`. **Do not void EXP-2026-00001.** | Lead bus. Overflow: `/home` then `/system` unique leftover. FAST-MERGE. Deploy cadence only. |
| **CC-1** | 9223 | `/accounting` TEST bill/expense/invoice · reload · reverse · JE; then `/factoring`. **Do not void TEST rows.** | Top OPEN **money** row on `docs/audit/GUARD-WORKORDERS.md` in CC-1 lane. **STOP `/425c`** (do not loop). Never `trigger_deploy`. |
| **CC-2** | 9224 | `/cash-flow` then `/finance` then `/settlements` unique. Do not remake Close. Reuse existing TEST projection/expense. Never GL. | `/reports` unique leftover → `/tasks` unique leftover. Then next POST leftover you do not steal. |
| **CC-3** | 9225 | If lists/legal METER3-WALK already on **this** SHA: reuse those TEST rows. Unique leftover hunt on `/lists` `/legal`. | `/compliance` → `/inventory` → `/users` → `/help`. Nested `+ Add new` = Lists creator. Never steal money/JE. |
| **Codex** | 9226 | `/customers` → `/drivers` → `/fleet` unique leftover. Do not remake Combobox `loading`. Create TEST customers/drivers if pickers empty. | `/fuel` unique leftover → `/eld`. Then silent-cap class if still OPEN. |
| **Cascade** | MCP | `/dispatch` unique FINDING on current SHA. Create TEST load if needed; **do not void**. | `/driver-hub` unique FINDING. ACK yourself. |
| **Devin** | MCP | `/vendors` unique FINDING on current SHA. Create TEST vendor if needed; **do not void**. | Stay `/vendors` depth (EXTENT). One Devin = this OUTBOX. |
| **Devin-A** | MCP | Same as Devin `/vendors` if you are the live Devin seat. | Do not duplicate Devin. |

---

## Current OPEN findings on `docs/audit/GUARD-WORKORDERS.md` (Cascade lane, /dispatch + /driver-hub)

| Finding | Status | Owner |
|---------|--------|-------|
| `DISPATCH-LOAD-PATCH-COMMODITY-COLUMN-MISSING-500` | **FIXED** (live re-proven 282777f → 33c41fc) | CC-3 |
| `DISPATCH-BORDER-CROSSING-WAIT-TIMES-RLS-500` | **FIXED** (live re-proven 282777f → 33c41fc) | CC-1 |
| `DISPATCH-DRIVER-LABEL-LOST-FOR-DEACTIVATED-DRIVERS` | **FIXED** (live re-proven 282777f → 33c41fc) | CC-1 |
| `DISPATCH-LOAD-STATUS-FILTER-ENUM-MISMATCH-400` | **FIXED** (live re-proven 282777f → 33c41fc) | CC-3 |
| `DISPATCH-CUSTOMER-LABEL-LOST-FOR-DEACTIVATED-CUSTOMERS` | **OPEN** — `resolve_customer_label_same_company` exists but not wired into `loads.routes.ts` | CC-1 |
| `DISPATCH-TRIP-PAIRING-EXPENSES-ENDPOINT-404` | **OPEN** — `/api/v1/accounting/expenses` 404; page no longer calls it | CC-3 |
| `DISPATCH-COMMODITY-CREATE-SILENT-NOOP` | **OPEN/ARCH** — architecture, routed CC-1 | CC-1 |

---

## BOX

```
SEAT=<you> GO-1722 FINISH LIVE CHROME + UNIQUE FIXES, THEN NEXT HOP.
Live SHA=healthz version. KEEP TEST UNTIL LAUNCH — do not void.
NOW=your exclusive URL. Create TEST. Do not void. Do not watch INBOX.
Never restamp U14. Never trigger_deploy. Skip #15546.
ACK: SEAT | ACK | GO-1722 | PORT=n | NOW=<url> | SHA=<healthz> | GO
```
