# PASTE ALL SEATS — GO-1829 (2026-08-25 ~18:29 CT)

**IDLE = DEFECT.** ACK in OUTBOX this turn then CODE. Empty inbox / “queue empty” / “holding for deploy” after healthz already moved = **you read the wrong row**.

CURRENT-LAW
- USMCA only · no TRANSP/TRK · no TMS→QBO write-back
- U14 14/14 CERTIFIED · never restamp
- CREATE-TEST-THEN-VOID · do not remake Complete / Close / /425c / Book Load
- FAST-MERGE · never `gh pr checks --watch` · CC never `trigger_deploy`
- Skip #15546

FACT (grep yourself — do not wait)
- Live API `GET https://api.ih35dispatch.com/api/v1/healthz/shallow` → **`3f49b42`** (includes #15941 invoice#=load# and #15947 cash-flow Proforma). **Hard-reload USMCA.**
- `origin/main` from-load.ts HAS `const displayId = loadNumber`
- Do **not** remake #15916 #15921 #15925 #15928 #15931 #15933 #15941 #15947
- Nobody `trigger_deploy` this turn (API already live)

| Seat | PORT | NOW (CODE THIS TURN) | Forbidden |
|------|------|----------------------|-----------|
| **CC-1** | 9223 | You are **MONEY**. You are **not** Cursor leftover. **NOW=#3** `PROGRAM-EXPENSE-DOCUMENT-POSTED-WITHOUT-JE` expense `57cabbab-f06a-4fa3-ad67-877eb2e64b0f` (`status=posted`, `posting_status=unposted`) — reuse poster, no new GL. Then items **4–10** on the **money clone**. Board row is still OPEN. | `/425c` · remake #1/#2 · `trigger_deploy` · claiming “queue empty” |
| **CC-2** | 9224 | **Item 26 NOW** — live-walk `/cash-flow` on `3f49b42`: Daily Prediction **Proforma / Pre-invoice**, AvP `basis: Proforma`, forecast `other` column. Then **27–50** unique leftover (`/reports` `/tasks` `/finance`). Polling for the next order = idle. | remake #15921/#15947 · `trigger_deploy` |
| **CC-3** | 9225 | **67–72 HUNT-PASS accepted.** **NOW=73–75** (`/program` matrix lists/legal · `/lists` second catalog · `/legal` second unique). Then keep hunting. `#64` still waits CC-1 #6. Re-verify `scenario.maintenance` on **`3f49b42`**, not `ecd09bf`. | remake #15933 · `trigger_deploy` · holding for a deploy that already landed |
| **Codex** | 9226 | Geofence Retry PASS accepted. **`eld_certified` FAIL is not a stop.** Board already has `SAMSARA-HOS-SNAPSHOT-MISSING-FOR-SELECTABLE-DRIVER` (CC-3 lane). **NOW:** item **76** `hop.assign` **UI only** (mint = CC-1 #8) then hunt **81–100** (`/drivers` `/fleet` `/safety` `/insurance` `/maintenance` `/fuel`). Do not wait on CC-3 Samsara to idle. | remake Book Load · U14 restamp · `trigger_deploy` |
| **Cascade** | audit | `git fetch origin && git reset --hard origin/main` (local diverge is not a HOLD). Walk `/program` **and** `/cash-flow` on **`3f49b42`**. Unique FINDING only. Missing labels on `ecd09bf` was deploy lag — **void that as a finding**. | product PR · U14 restamp · merge/rebase theater |
| **Devin-A** | audit | Items **126–150**. Walk `/program`. Not PARKED. Unique FINDING. OUTBOX same turn. | U14 restamp |
| **Cursor** | 9222 | Lead. Unique leftover **151+**. Skip #15546. Nobody second-kicks. | remake 1–2 · `trigger_deploy` |

ACK: `SEAT | ACK | GO-1829 | PORT=n | NOW=<your now from table> | GO`
