# INBOX-CC-3 · 9225

**23:15 CT ACK received.** `PARTS-RECEIVE` complete: `maintenance.parts_purchases` `45f36791-8f34-4705-9a32-34131d82a509` on WO `850e2cc4-…`. Do not remake. Next leftover unique only. Never remake CLASS-F5973 / bill `2153f5dc`. Invoice#=load# is CC-1. Geofence is Cursor. Never `trigger_deploy`.

**22:34 CT GO — FIXER.** Live `20c02fd`. `scenario.parts_receive` on WO `850e2cc4-…`. Program card must leave `--`. Invoice#=load# is CC-1. Book Load is Cursor. Never remake CLASS-F5973. Never `trigger_deploy`.

**22:18 CT GO — FIXER then prove Program `scenario.parts_receive` green.** Hard-reload SPA. Live `20c02fd`. Never remake CLASS-F5973 / bill `2153f5dc-…`. Never `trigger_deploy`.

**NOW:** Receive parts onto WO `850e2cc4-1578-40c2-b38d-a528f7ea821d` via `/inventory/purchases`. Name `maintenance.parts_purchases` UUID. `/program` card `scenario.parts_receive` must leave `--`. Then leftover unique (WO `.html` 400 if still true). Book-load is Cursor. Money JE is CC-1.

**21:57 CT GO — hard-reload when healthz=`ab737d3` and SPA build of #15687 is live.** `parts_receive` on WO `850e2cc4-…`. Unit_id already proved on bill `2153f5dc-…`. Never remake CLASS-F5973. Never `trigger_deploy`.

**19:39 CT GO — unit_id PROVED on Bill `2153f5dc-b3e9-4993-9261-5da3e727853d` (`unit_id=bb1e77ab-…` T-DEAD, `linked_work_order_uuid=12a6f233-…`). Do not remake that bill.**

**NOW:** `scenario.parts_receive` on WO `850e2cc4-1578-40c2-b38d-a528f7ea821d`. Then next leftover unique. Never remake CLASS-F5973. Never `trigger_deploy`.

**19:13 CT GO — live SHA `1bfaaf2` (WO-bill FK is live). Hard-reload. Do not remake CLASS-F5973. Never `trigger_deploy`.**

**NOW:**
1. Retry **Create work order & Bill** (Net 30 + category line) on a **new labeled TEST**. FK must not 500.
2. `scenario.parts_receive` on WO `850e2cc4-1578-40c2-b38d-a528f7ea821d`.
3. Unit prefill is merged (#15649). Hard-reload the SPA. From that WO, **+ Create Bill** must stamp `unit_id`. Do not SQL-patch BILL-2026-00015. Do not duplicate the Cursor PR.

OUTBOX: `CC-3 | ACK | WO-BILL-FK-LIVE | PORT=9225 | SHA=<healthz> | BILL=<uuid-if-created> | UNIT_ID=<uuid-or-null> | FINDING=<id-or-none> | GO`
