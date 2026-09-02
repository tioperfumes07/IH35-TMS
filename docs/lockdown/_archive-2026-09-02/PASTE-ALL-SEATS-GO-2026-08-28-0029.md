# GO-0029 — EVERY MODULE · EVERY SEAT · THIS IS NOW

`git pull --ff-only origin main`
Instruction = this packet **and** `docs/bus/FEED/NOW-<SEAT>.md`

App: `https://app.ih35dispatch.com` · entity **USMCA only** · API `GET https://api.ih35dispatch.com/api/v1/healthz/shallow` → `version`

**Owner (this hour):** stamps on the exclusive U14 table are **not** “product done.” Missing chrome, missing labeled TEST hops, and leftover 500/dead/silent still count. **Do the work.** Do **not** restamp U14. Do **not** wait for CC-1 money leftovers. Money and chrome run **in parallel**.

**PROG-01 / migration `202613270000`:** **SKIP forever.** Already answered. Do not ask Jorge. Do not author it.

**Nobody except Cursor `trigger_deploy`.** Skip PR **#15546** **#16895**. KEEP TEST (void at launch). FAST-MERGE after local gate PASS. Never `gh pr checks --watch`. Idle = defect.

ACK: `SEAT | ACK | GO-0029 | NOW=<from your FEED> | SHA=<healthz> | GO`

---

## How to work a module (all seats)

For **your** URLs only, every tab:

1. **Chrome:** QBO/McLeod — `+ Create`/`+ Book`, ParityDrawer/side panel, DatePicker picks a day (no seize), combobox `+ Add new` first row, no box-in-box, no dead click, no silent no-op.
2. **TEST hop:** CREATE labeled **TEST DATA** through the live wizard → save → canonical table → reload. Empty TMS is expected; that is not a stop. Do not void until launch.
3. **FINDING:** 500 / dead click / silent no-op / reverse-empty (Neon has rows, UI 0) → board `docs/audit/GUARD-WORKORDERS.md` **same turn** + OUTBOX. Fix in-lane same turn if it is yours.
4. Grep main before remake. Unique only.

**CC-1 money leftovers do not gate chrome or TEST creates.** CC-1 keeps posting/GL. Everyone else keeps clicking and shipping FE.

---

## THE 14 (chrome + TEST + unique leftover — never restamp)

| # | Module | URL | Seat that OWNS it this GO | Chrome NOW | TEST hop NOW (labeled TEST DATA) | Do not |
|---|--------|-----|---------------------------|------------|----------------------------------|--------|
| 1 | Accounting | `/accounting` | **CC-1** money · **Cursor** chrome if idle | Every sub-nav: CoA, bills, expenses, invoices, JE, payments, reports. Pickers + drawers. | TEST expense **and** TEST bill (header+lines). Reload. Canonical `accounting.*`. Match/recon is banking. | Invent GL math. TMS→QBO write-back. Remake Event 2. Remake ACCT-F9877. |
| 2 | Banking | `/banking` | **CC-3** chrome · **CC-1** match/recon if you reach it | Feed, rules, match, categorize, recon, registers. BANK-CTRL-01 flags ON = ratified, not a defect. | TEST expense → **Match** same $ → recon Accept. Do not drain For-review. | Flip `BANK_FEED_GL_POSTING_ENABLED`. Steal `/eld` before banking chrome is walked. |
| 3 | Settlements | `/settlements` | **CC-1** | Pay run, deductions, escrow reverse. | One TEST settlement hop on a TEST load if wizard lives; else unique FINDING only. | `/425c` loop. |
| 4 | Factoring | `/factoring` | **CC-1** | Schedule, advances, reserve chrome (do not create/reclassify reserve accounts — Rule 19). | TEST factor schedule on a TEST invoice if path exists; else unique FINDING. | Owner-manual reserve accounts. |
| 5 | Dispatch | `/dispatch` | **Codex** | Board, Book Load, assign, planner, POD/BOL, late arrivals. DSP-MONEY-F7175 invoice lookup fail-closed shipped `#17338` — do not remake. | Book labeled TEST load → persist → reload. Then one TEST assign if units/drivers exist. | Steal vendors. Restamp U14. #15546. |
| 6 | Vendors | `/vendors` | **Devin** | List, detail, A/P reverse, PATCH row-scope already `#17200`. VEND-S01 USMCA count is **123** not 4. | TEST vendor via `+ Create` → `mdata.vendors` → appears in picker. | Body-scoped PATCH. `mdata.qbo_vendors` writer. COMPLETE. |
| 7 | Customers | `/customers` | **Devin-A** | List, detail, invoices reverse. CUST-MONEY-F6057A retry UI — grep before remake. | TEST customer `+ Create` → `mdata.customers`. Nested `+ Add new` = Lists chrome. | Steal `/vendors`. |
| 8 | Drivers | `/drivers` | **Codex** after dispatch slice **or** if dispatch idle | Profile, DQ, HOS, earnings chrome (earnings money truth = CC-1 if GET masquerades as zero). | TEST driver `+ Create` canonical modal. | Invent load FKs on historical fuel. |
| 9 | Fleet | `/fleet` | **Codex** | Units, trailers, assignment reverse. | TEST unit/trailer create if wizard lives. | TRANSP/TRK asset/depr campaign. |
| 10 | Lists | `/lists` | **CC-3 FIRST** | Every catalog card → correct list → `+ Create` = same wizard pickers use. `+ Add new` first row. | TEST vendor **or** TEST customer **or** TEST CoA row through Lists, not a second chrome. | Steal `/vendors` from Devin. Underscore-combobox remakes already shipped. |
| 11 | Maintenance | `/maintenance` | **CC-3** after Lists | WO list/detail, road service, parts. Road service TEST row already existed — unique FINDING only. | TEST WO `+ Create` → `maintenance.work_orders`. Vendor picker = `mdata.vendors`. | Write `mdata.qbo_vendors`. |
| 12 | Safety | `/safety` | **CC-3** after Maintenance | Accidents, events, fines, meetings. Spawn WO if shown. | TEST safety event **or** TEST fine labeled TEST. | SAFETY-EVENTS schema `is_sample_data` (CC-1 migration) — file board, do not invent DDL if not your lane; keep walking chrome. |
| 13 | Insurance | `/insurance` | **CC-3** chrome · **CC-1** claim $ | Policies, claims, graph reverse. | TEST claim linked to TEST load/unit if pickers work. | New GL poster. |
| 14 | Legal | `/legal` | **CC-3** after Insurance | Matters, templates. Nested create = Lists chrome. | TEST matter labeled TEST. | LEGAL-TEMPLATE money. |

---

## Leftover POST (same bar — unique FINDING + TEST)

| Module | URL | Seat | NOW |
|--------|-----|------|-----|
| Cash flow | `/cash-flow` | **CC-2** | Calendars + unique leftover. Proforma labels already law — grep before remake. |
| Finance hub | `/finance` | **CC-2** | Honest flag-off is **not** a FINDING. Unique 500/dead/silent only. |
| Reports | `/reports` | **CC-2** | Unique leftover. Deactivated-label joins are OPEN on board — **CC-2** may fix non-money report SQL. |
| Tasks | `/tasks` | **CC-2** | TASK-XTENANT `#17218` shipped — do not remake. Next unique class. |
| Driver hub | `/driver-hub` | **CC-3** if Lists idle | OPEN `DRIVER-HUB-LEAVE-REQUESTS-TAB-STUCK-ON-SCHEDULER` — URL `?tab=leave_requests` must mount Leave Requests, not Scheduler. Fix if still true on main. |
| Fuel | `/fuel` | **Codex** if dispatch idle | Unique leftover. No invented `load_id` on QBO-import rows. |
| Compliance | `/compliance` | **Cascade** walk | Unique FINDING. |
| Inventory | `/inventory` | **Cascade** | Unique FINDING. Void-not-delete already shipped. |
| Home | `/home` | **CC-2** after reports | Unique leftover. |
| Program | `/program` | **Cursor** honesty | No lying Built. PROG-01 SKIP. |
| ELD | `/eld` | **CC-3 last** | Hidden stub is not “missing.” Unique 500 only. |
| Users / Docs / Help / System | those routes | **Cascade** | Unique FINDING. |
| 425C | `/425c` | **Nobody** | Do not loop. |

---

## Per-seat NOW (execute in this order — never idle)

### CC-3 (9225) — YOU WERE WAITING. THIS IS YOUR PACKET.

ACK: `CC-3 | ACK | GO-0029 | NOW=lists-then-legal-then-maint-safety-insurance | SHA=<healthz> | GO`

1. **`/lists` now.** Click every card. `+ Create` and nested `+ Add new` = Lists creator. DatePicker: pick a day. Unique 500/dead/silent → board + FAST-MERGE.
2. **`/legal`.** Same chrome. TEST matter.
3. **`/maintenance`.** TEST WO. Vendor = `mdata.vendors`.
4. **`/safety`.** TEST event or fine.
5. **`/insurance`.** TEST claim chrome (no new GL math).
6. **`/banking`.** USMCA live chrome + one TEST expense match if not already proven this SHA. BANK-CTRL-01 is not a defect.
7. If still moving: **`/driver-hub`** Leave Requests tab (stuck-tab FINDING).
8. **`/eld` last.**

Never steal `/vendors` (Devin). Never steal Book Load (Codex). Never `trigger_deploy`. Never GL.

### CC-1 (9223)

ACK: `CC-1 | ACK | GO-0029 | NOW=accounting-then-settlements-factoring-banking-match | SHA=<healthz> | GO`

`BANK-TRANSFER-BALANCE-DUAL-WRITER-CONFLICT` if still OPEN, then leftover `/accounting` unique money, then settlements/factoring. **Do not block other seats.** Do not remake 9877. Do not author PROG-01.

### CC-2 (9224)

ACK: `CC-2 | ACK | GO-0029 | NOW=reports-cash-flow-finance-tasks | SHA=<healthz> | GO`

`/reports` → `/cash-flow` → `/finance` → `/tasks`. New class (not GO-0016 bare-catch, not TASK-XTENANT). Honest UNVERIFIED if no live trigger. Never GL.

### Codex (9226)

ACK: `CODEX | ACK | GO-0029 | NOW=dispatch-then-drivers-fleet-fuel | SHA=<healthz> | GO`

`/dispatch` unique leftover + Book TEST load. Then `/drivers` `/fleet` `/fuel`. Do not remake DSP-MONEY-F7175. Never restamp U14.

### Devin

ACK: `DEVIN | ACK | GO-0029 | NOW=vendors-chrome-and-TEST-create | SHA=<healthz> | GO`

Paste `docs/lockdown/PASTE-DEVIN-GO-2026-08-28-0029.md`. `/vendors` USMCA. TEST create. VEND-S01 = 123.

### Devin-A

ACK: `DEVIN-A | ACK | GO-0029 | NOW=customers-chrome-and-TEST-create | SHA=<healthz> | GO`

`/customers` then `/driver-hub` only if CC-3 has not taken Leave Requests. Do not steal vendors.

### Cascade

ACK: `CASCADE | ACK | GO-0029 | NOW=unique-FINDING-all-sidebar | SHA=<healthz> | GO`

Walk accounting→customers→vendors→dispatch on **live healthz**. Unique FINDING only. Append ledger. No product PR. No U14 restamp.

### Cursor (9222)

ACK: `CURSOR | ACK | GO-0029 | NOW=lead-chrome-janitor-deploy-5-10 | SHA=<healthz> | GO`

Lead. Census. FAST-MERGE. Chrome/picker leftovers. Deploy only 5–10 min **and** 5–10 PRs. Nobody else kicks Render.

---

## Forbidden

HOLD. Waiting for CC-1. Waiting for a new GO after this packet. PROG-01. U14 restamp. TRANSP/TRK/QBO sync. Dual Devin. `trigger_deploy` (non-Cursor).
