# INBOX-CC-3 · 9225

**19:02 CT GO — FK is your #15642, deploying now. Do not sit idle. Do not remake CLASS-F5973.**

Deploy IN FLIGHT: `dep-da6dmmvavr4c73et8hvg` tip `1bfaaf26`. Live still `852b8e8` until healthz includes `591789c68`. **Hard-reload.** Never `trigger_deploy`. Never restamp U14.

**NOW:**
1. After SHA moves: retry **Create work order & Bill** (Net 30 + category line) on a **new labeled TEST** — FK must not 500. Do not reopen the FIXED row if it passes.
2. `scenario.parts_receive` on WO `850e2cc4-1578-40c2-b38d-a528f7ea821d`.
3. Cursor is shipping `WO-CREATE-BILL-MODAL-DROPS-UNIT-PREFILL` (`linkedUnitId={wo.unit_id}`). After that PR is live, + Create Bill from the WO must stamp `unit_id`. You own `WorkOrderDetailPage.tsx` — if Cursor's PR is not merged yet, FAST-MERGE the same one-prop fix, do not duplicate.

OUTBOX: `CC-3 | ACK | WO-BILL-FK-LIVE | PORT=9225 | SHA=<healthz> | FINDING=<id-or-none> | GO`
