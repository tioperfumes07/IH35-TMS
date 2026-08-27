# GO-0734 — LIVE `0340406` · ROUTE CASCADE 5 · FIX ON THE RIGHT SEAT · 2026-08-27 07:34 CT

**THIS IS NOW.** Waiting for deploy = defect. Live **`0340406`** (`healthz` ok). Hard-reload. Skip #15546. Nobody `trigger_deploy`. U14 first. ELD=`/compliance`.

ACK: `SEAT | ACK | GO-0734 | PORT=n | NOW=<id> | SHA=0340406 | GO`

Same-turn: OUTBOX `FINDING | ID | routed=<seat>` + board OPEN. Jorge is not the messenger.

---

## Cascade 5 — owner + NOW (do not wait, do not remake)

| ID | Status on main | Who | Do |
|----|----------------|-----|-----|
| `DISPATCH-LOAD-PATCH-COMMODITY-COLUMN-MISSING-500` | **FIXED #16616** | **Cascade** | Re-prove PATCH on **`0340406`**. Do not remake. |
| `DISPATCH-LOAD-COMMODITY-CREATE-SILENT-NOOP-AND-BOARD-DISPLAY-DEAD` | OPEN architecture | **CC-1** (schema) after PATCH re-prove; **do not guess columns** | Decide persist vs remove dead UI. Not CC-3 drive-by. |
| `DISPATCH-LOAD-STATUS-FILTER-ENUM-MISMATCH-400` | OPEN | **CC-3** | Map FE status query to backend enum. One PR. |
| `DISPATCH-DRIVER-LABEL-LOST-FOR-DEACTIVATED-DRIVERS` | REGRESSED | **CC-1** resolver `mdata.resolve_driver_label_same_company` (same family as customer/vendor). **CC-3** HOS RetryRetryRetry chrome + 404 fail-loud. | Two PRs, serial by hotfile. |
| `DISPATCH-BORDER-CROSSING-WAIT-TIMES-RLS-500` | OPEN 42501 INSERT | **CC-1** | Cache write RLS / lucia wrap. Not CC-3 FE. |
| `DISPATCH-TRIP-PAIRING-EXPENSES-ENDPOINT-404` | OPEN GET `/accounting/expenses` | **CC-3** | Point at canonical expenses GET (not a ghost `/accounting/expenses`). Surface error. No new GL math. |

**Cascade NOW:** hard-reload `0340406`. Re-prove commodity PATCH. Unique 500/dead only. Self-ACK GO-0734 (GO-0604 on `78240b9` is stale).

**Devin NOW:** `/vendors` unique empty is **honest**. Stay exclusive. Unique 500/dead only. ACK GO-0734 SHA=`0340406`. Do not idle-monitor.

**Codex NOW:** keep Driver/Fleet/Safety unique FAST-MERGE. ACK GO-0734. Never restamp U14. Never `trigger_deploy`.

**CC-2 NOW:** `/settlements` then leftover `/cash-flow`. Never GL. ACK GO-0734.

**CC-1 NOW:** (1) hop.assign rate-card (2) driver-label resolver (3) border-crossing wait-times RLS. Never `trigger_deploy`.

**CC-3 NOW:** status-filter 400 then trip-pairing expenses 404. Then `/lists` leftover unique. Ping CC-1 for RLS/migration. No remake #16616.

**Cursor:** lead. No second-kick.
