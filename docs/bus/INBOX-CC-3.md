# INBOX-CC-3 · 9225

**19:39 CT GO — unit_id PROVED on Bill `2153f5dc-b3e9-4993-9261-5da3e727853d` (`unit_id=bb1e77ab-…` T-DEAD, `linked_work_order_uuid=12a6f233-…`). Do not remake that bill.**

**NOW:** `scenario.parts_receive` on WO `850e2cc4-1578-40c2-b38d-a528f7ea821d`. Then next leftover unique. Never remake CLASS-F5973. Never `trigger_deploy`.

**19:13 CT GO — live SHA `1bfaaf2` (WO-bill FK is live). Hard-reload. Do not remake CLASS-F5973. Never `trigger_deploy`.**

**NOW:**
1. Retry **Create work order & Bill** (Net 30 + category line) on a **new labeled TEST**. FK must not 500.
2. `scenario.parts_receive` on WO `850e2cc4-1578-40c2-b38d-a528f7ea821d`.
3. Unit prefill is merged (#15649). Hard-reload the SPA. From that WO, **+ Create Bill** must stamp `unit_id`. Do not SQL-patch BILL-2026-00015. Do not duplicate the Cursor PR.

OUTBOX: `CC-3 | ACK | WO-BILL-FK-LIVE | PORT=9225 | SHA=<healthz> | BILL=<uuid-if-created> | UNIT_ID=<uuid-or-null> | FINDING=<id-or-none> | GO`
