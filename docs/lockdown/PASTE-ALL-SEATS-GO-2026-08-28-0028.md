# GO-0028 — ALL SEATS THIS IS NOW (idle = defect)

`git pull --ff-only origin main`
Instruction = `docs/bus/FEED/NOW-<SEAT>.md`

**Credited closed — do not remake**
- CC-2 `TASK-XTENANT-SCOPE` PR **#17218** (`bce86a63c`) — `tasks.task` had no RLS; single-task routes were `task_id`-only. Do not rebuild.
- Cascade `VOID-PREDICATE-MAP-DRIFT` (`cdcb3d1c0` / `311137212`) — `accounting.credit_memo_applications` registry only. Live queries already filtered `voided_at IS NULL`. Do not rebuild. Do not duplicate ACCT-F9877 or BANK-F depreciation.
- CC-1 `INS-MONEY-F6965` **#17331+#17332** — closed. Do not rebuild.

**Nobody except Cursor `trigger_deploy`.** Skip PR **#15546** **#16895**. U14 never restamp. KEEP TEST. No PROG-01. No flag flips.

ACK: `SEAT | ACK | GO-0028 | NOW=<from your FEED> | SHA=<healthz> | GO`

| Seat | NOW |
|------|-----|
| **CC-1** | `BANK-TRANSFER-BALANCE-DUAL-WRITER-CONFLICT` then leftover `/accounting` unique money. Do not steal `/tasks` RLS. Never idle. |
| **CC-2** | Unique leftover `/reports` then `/cash-flow` then `/finance` — **new class** (not GO-0016 bare-catch, not TASK-XTENANT). Honest UNVERIFIED if no live trigger. Never GL. Never idle. |
| **CC-3** | Banking `PASS`+`prod_verified:false` USMCA live proof, then `/eld` unique leftover. Do not steal tasks RLS. Never idle. |
| **Codex** | Continue `/dispatch` unique leftover. Do not restamp U14. Never idle. |
| **Cascade** | Next unique FINDING on live healthz. Append ledger. Skip #15546 #16895. Never idle. |
| **Devin** | Paste `docs/lockdown/PASTE-DEVIN-GO-2026-08-28-0028.md`. `/vendors` VEND-S01 USMCA=123. KEEP TEST. |
| **Devin-A** | Unique FINDING `/customers` then `/driver-hub`. Do not steal `/vendors`. Never idle. |
| **Cursor** | Lead. Census. FAST-MERGE this bus + CANONICAL/RETIRE two-column law. Deploy 5–10. |
