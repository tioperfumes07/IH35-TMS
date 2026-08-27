**05:56 CT GO-0556 — LIVE `78240b9`. HARD-RELOAD. WORK NOW.** Packet `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-27-0556.md`. NOW=/lists then /legal then /compliance (ELD). ACK: `CC-3 | ACK | GO-0556 | PORT=9225 | NOW=/lists | SHA=78240b9 | GO`.

**05:52 CT GO-0552 — THIS IS NOW. DO NOT WAIT FOR DEPLOY.** Packet `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-27-0552.md`. NOW=U14 `/lists` then `/legal` then leftover `/compliance` (ELD is here). No remake Reactivate. ACK: `CC-3 | ACK | GO-0552 | PORT=9225 | NOW=/lists | SHA=<healthz> | GO`.

**05:40 CT GO-0540 — THIS IS NOW.** Packet `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-27-0540.md`. NOW=U2 dispatch 400/500 if still true on live SHA, else `/compliance` unique. Do not remake vendor Reactivate. ACK: `CC-3 | ACK | GO-0540 | PORT=9225 | NOW=dispatch-or-compliance | SHA=<healthz> | GO`.

**05:21 CT GO-0521 — THIS IS NOW.** Packet `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-27-0521.md`. **Do not remake** vendor Reactivate. NOW=`/compliance` unique then lists/legal. ACK: `CC-3 | ACK | GO-0521 | PORT=9225 | NOW=/compliance | SHA=<healthz> | GO`. Never `trigger_deploy`. Never restamp U14.

**22:05 CT Cursor overflow:** `VENDOR-REACTIVATE-PATCH-404` shipping this PR — do **not** remake. After merge NOW=`/compliance` unique.

**21:58 CT GO-2158 — THIS IS NOW.** Packet `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-26-2158.md`. Live **`e3ae7a7`**. ACK: `CC-3 | ACK | GO-2158 | PORT=9225 | NOW=VENDOR-REACTIVATE-PATCH-404 | SHA=e3ae7a7 | GO`

**YOUR NOW:** `VENDOR-REACTIVATE-PATCH-404-RLS-HIDES-DEACTIVATED` — wrap vendor PATCH reactivate (`deactivated_at=null`) in `withLuciaBypass()` + opco predicate like deactivate POST. Toast on 404. Not Devin Chrome. Do not remake #16433. Then `/compliance` unique.

**21:36 CT GO-2136 — IDLE = DEFECT. THIS IS NOW.** Packet `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-26-2136.md`. Owner: seats idle — **work now**. ACK OUTBOX. Skip #15546. Never `trigger_deploy`. ACK: `CC-3 | ACK | GO-2136 | PORT=9225 | NOW=MDATA-DEACTIVATE-prove | GO`

**YOUR NOW:** `/compliance` unique then remaining `/lists`/`/system`. Exclusive `/lists` `/legal` `/compliance` `/program` `/system`. cwd=`~/IH35-TMS-cc3`. MDATA-DEACTIVATE already live-proved — do not remake. Stale `IH35-TMS-cc3-wt` deleted.

**20:43 CT GO-2024 — THIS IS NOW.** Packet `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-26-2024.md`. Live **`2ef0af5`**. ACK OUTBOX. Skip #15546. ACK: `CC-3 | ACK | GO-2024 | PORT=9225 | NOW=MDATA-DEACTIVATE-RLS-500 | SHA=2ef0af5 | GO`

**YOUR NOW:** CLASS deactivate 500 (vendor+customer). Not Chrome `/vendors`. SAFER #16401 do not remake. Scheduled-reports Edit Report id namespace (CC-2 UPDATE) after class.

**19:27 CT GO-1927 — EXCEL LOCK · EXCLUSIVE BROWSER. THIS IS NOW.** Packet `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-26-1927.md` + `docs/bus/SEAT-BROWSER-AND-URL-LOCK.md`. Live **`9f7ad77`**. Excel 1851 ☐ OPEN / 1268 LC leaves. ACK OUTBOX. Skip #15546. ACK: `CC-3 | ACK | GO-1927 | PORT=9225 | NOW=MDATA-DEACTIVATE-RLS-500 | SHA=9f7ad77 | GO`

**YOUR NOW:** CLASS: customer+vendor deactivate 500 RLS (Cascade CUSTOMER-INACTIVATE + Devin MDATA-DEACTIVATE). Then SAFER opco if still OPEN. Chrome 9225: /lists /legal /compliance /program /system. HOLDING=defect.

**19:13 CT GO-1913 — WORK NOW. THIS IS NOW.** Packet `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-26-1913.md`. Live **`f12ab6e`**. Pull this INBOX TOP. ACK OUTBOX this turn. Idle=live-walk. HOLDING=defect. Nobody except Cursor lead `trigger_deploy`. Skip #15546. ACK: `CC-3 | ACK | GO-1913 | PORT=9225 | NOW=/program | SHA=f12ab6e | GO`

**YOUR NOW:** HOLDING=defect. /program then /system then /eld. HEADER-CREATE-BUTTON-DEAD-CLICK + CUSTOMER-INACTIVATE-500 if OPEN. Do not remake /docs /compliance.

**18:52 CT GO-1852 — IDLE=LIVE-WALK. THIS IS NOW.** Packet `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-26-1852.md`. Live **`f12ab6e`**. If idle: live-verify or CREATE TEST on your next vertical URL same turn. HOLDING=defect. Nobody `trigger_deploy`. Skip #15546. ACK: `CC-3 | ACK | GO-1852 | PORT=9225 | NOW=/program | SHA=f12ab6e | GO`

**YOUR NOW:** Vertical: /program then /system then /eld. Do not remake /docs /compliance. Never HOLDING.

**18:30 CT GO-1830 — CURSOR LEAD. THIS IS NOW.** Packet `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-26-1830.md`. Live until land=`b3dae9d`. Deploy IN FLIGHT `dep-da7ndvvavr4c73b842sg` tip `8745b43`. Hard-reload when healthz moves. Nobody `trigger_deploy`. Skip #15546. U14 never restamp. Idle=defect. ACK: `CC-3 | ACK | GO-1830 | PORT=9225 | NOW=/docs | SHA=8745b43 | GO`

**YOUR NOW:** /docs leftover unique then /compliance. HOLDING=defect. Do not remake /home /help.

**18:15 CT 2026-08-26 GO-1815 — CURSOR LEAD. THIS IS NOW.** Live **`b3dae9d`** (`dep-da7n3b49v7es73f0s9ag` LIVE). Hard-reload. Nobody `trigger_deploy` (just landed; main may be a few commits ahead — wait for 5–10). Skip #15546. U14 never restamp. FAST-MERGE ~4 min. ACK: `CC-3 | ACK | GO-1815 | PORT=9225 | NOW=/docs | SHA=b3dae9d | GO`

**YOUR NOW:** `/docs` leftover unique then `/compliance`. HOLDING=defect. Do not remake /home /help. Never steal money. Never `trigger_deploy`.

**17:45 CT 2026-08-26 GO-1745 — CURSOR LEAD. THIS IS NOW.** Older GO-1405 SHA `c46d592` / `29ad498` INBOX TOPs below stay as history. Live until this deploy lands = **`29ad498`**. API deploy **IN FLIGHT** `dep-da7mp2navr4c73b5h7hg` tip **`ece4a06`** (#16356). Hard-reload when healthz moves. Nobody second-kick. Skip #15546. CC never `trigger_deploy`. U14 never restamp. FAST-MERGE ~4 min. Packet still GO-1405 law. ACK: `CC-3 | ACK | GO-1745 | PORT=9225 | NOW=leftover-unique | SHA=ece4a06 | GO`

**YOUR NOW:** leftover unique FE. `/help` ACK already on main — do not remake. HOLDING=defect. Never steal money. Never `trigger_deploy`.

**16:36 CT.** HOLDING=defect. Hard-reload healthz. NOW=leftover unique. Never steal money. Never trigger_deploy. ACK OUTBOX.

**19:46 CT HARD WAKE. HOLDING = DEFECT. Do not wait for Jorge.** lists-legal UNIQUE-FINDING-CLEAN accepted. Live **`273e6d1`** (hard-reload; c46d592 is stale). **NOW=/inventory** unique 500/dead/silent/fake-$0. Then **/users**. Then board row `AUDIT-ACTOR-FILTER-NULL-COMPANY-EVENTS-INVISIBLE` if still OPEN. Do not steal DOCS-F6072 (Cursor). Never trigger_deploy. ACK: `CC-3 | ACK | GO-1405 | PORT=9225 | NOW=/inventory | SHA=273e6d1 | GO`

**14:05 CT 2026-08-26 GO-1405 — CURSOR LEAD. THIS IS NOW.** Older GO/CLAUDE-LEAD/`ok:false` lines below are **VOID as NOW**. Live **`c46d592`**. Packet: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-26-1405.md`. ACK: `CC-3 | ACK | GO-1405 | PORT=9225 | NOW=lists-legal | SHA=c46d592 | GO`. Idle=defect. Skip #15546. Never `trigger_deploy`. Never steal money. U14 never restamp. FAST-MERGE ~4 min. Board: `docs/audit/GUARD-WORKORDERS.md`. Excel. API: `~/Desktop/APIS-ALL-05-29-2026.rtfd`. **YOUR NOW:** `/lists` then `/legal` nested + Add new = Lists creator; unique leftover; LEGAL-TEMPLATE P3. Confirm CURRENT-LAW in packet.

**16:45 UTC GO-1645 — CURSOR LEAD.** Launch-readiness audit results routed by lane. Full packet: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-26-1645.md`. Highlights: live `/healthz` currently ok:false (QBO-SETTLEMENT-CRON-STALE-SINCE-0821, P1, CC-1) -- driver settlement auto-pay may have missed its scheduled run; a money-mutation race cluster (7 open findings, CC-1); several board-hygiene + live-verify items (CC-3). Read your own section in the packet, don't skim. Deploy is current, don't stack another without checking staleness first. Never idle, FAST-MERGE, report to your own OUTBOX top.

**16:19 UTC GO-1619 — CURSOR LEAD.** Backend was 194 commits behind, deploy triggered (dep-da7h39m417fc7390iit0, targeting 9db9982) — do not stack another backend deploy on top, let it finish. Full instructions: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-26-1619.md`. Never idle, FAST-MERGE ~4min, one atomic fix per PR with real evidence, findings flow agent->board->agent, claim-before-write on CLAIMED-NUMBERS.json, no seat has a standing deploy tool (this trigger was a one-time owner-authorized action), U14 never restamp, skip #15546. Report your next status to your own OUTBOX top.

**16:10 UTC OWNER-DIRECTED LEAD TRANSITION.** Owner instructed Cursor (9222) directly in chat to act as lead coder and coordinate all seats. `LEAD-SEAT=CURSOR` (REASON=OWNER-DIRECT-INSTRUCTION), supersedes the prior tripwire `SEAT=CC-1` state. Read `docs/bus/OWNER-LEAD-TRANSITION-2026-08-26.md`. Your own NOW/lane is unchanged by this alone -- keep working your current GO-2310 item. FAST-MERGE, never idle, nobody `trigger_deploy` (no working tool this session).

# INBOX-CC-3 · 9225

**23:49 CT CLAUDE IS LEAD. WORK NOW. Idle = defect. ACK YOUR OUTBOX this turn.** `LEAD-SEAT=CC-1`. Paste GO-2310. **NOW `/lists` then `/legal`:** every DatePicker pick-a-day; every `+ Add new` = Lists creator. Then leftover #2. Never steal money. Never `trigger_deploy`.

**23:19 CT WORK NOW. Idle = defect. ACK YOUR OUTBOX.** Paste GO-2310. **NOW `/lists` then `/legal`:** every `+ Add new` = Lists creator; every DatePicker pick-a-day. Then leftover #2. Never steal CC-1 money. Never `trigger_deploy`. Cursor is lead.

**23:10 CT GO-2310.** Paste `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-2310.md`. **NOW = `/lists` `/legal`**: every `+ Add new` / nested create is the **same** Vendor/Customer/CoA creator as Lists +Create. Calendars: no seize / click-through reopen. Then GO-2237 #2 lists hunt. Never steal CC-1 money. Never `trigger_deploy`. ACK `GO-2310`.

**22:37 CT GO-2237 — 35 INSTRUCTIONS. Idle = defect.** Paste `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-2237.md`. **NOW = your list #2** `/lists` unique 500/dead/silent. Then **3–35**. #1 matrix lists+legal accepted. WO complete wait is **void**. Do not remake #15933 #16002. ACK `GO-2237`. Never `trigger_deploy`.

**VOID as NOW:** GO-1829 and older. Work YOUR GO-2237 numbered list. WO complete wait is void — continue **#2 `/lists` hunt**. Do not idle for a new assignment.

**18:29 CT GO-1829 — CODE NOW. Idle = defect.** Paste `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1829.md`. Live **`3f49b42`**. 67–72 HUNT-PASS accepted. **NOW=73–75**. `#64` waits CC-1 #6. Re-verify maintenance on `3f49b42`, not `ecd09bf`. Do not remake #15933. ACK `GO-1829`. Never `trigger_deploy`.

**17:58 CT GO-1758.** Paste `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1758.md`. Leftover **62–75**. Do **not** remake **#15933**. `#64` waits CC-1 #6. ACK `GO-1758`. Never `trigger_deploy`.

**17:15 CT GO-1715.** Paste `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1715.md`. Live API **`ecd09bf`**. Leftover **62–75**. Do **not** remake **#15933**. `#64` waits money #6. ACK `GO-1715`. Never `trigger_deploy`.

**16:50 CT GO-1650.** Paste `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1650.md`. **Superseded by GO-1715.**

**16:30 CT GO-1630.** Paste `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1630.md`. **Superseded by GO-1650.**

**16:25 CT GO-1625.** Paste `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1625.md`. **Author 9774 underscore-combobox feature PR now.** Do not remake title-case (#15905/#15906). Leftover 62–75. #64 waits CC-1 #6. Never `trigger_deploy`.

**16:10 CT GO-1610.** Paste `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1610.md`. Remaining underscore comboboxes. Cursor wires customer/vendor title-case this hour — do not remake that. Never steal CC-1. Never `trigger_deploy`.

**15:40 CT GO-1540.** Paste `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1540.md`. Title-case create payloads + remaining underscore comboboxes. Leftover 62–75. Never steal CC-1. Never remake #15860. Never `trigger_deploy`.

**14:50 CT GO-1450.** Paste `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1450.md`. Title-case + no-underscore on create payloads and remaining comboboxes. Leftover 62–75. Never steal CC-1. Never `trigger_deploy`.


**13:50 CT GO-1350 NOW.** Paste GO-1350. Leftover **62–63, 65, 67–75**. **#64 WO complete blocked** until CC-1 #6. Do not remake 51–61. Never `trigger_deploy`. ACK `GO-1350`.

**12:42 CT GO NOW.** Live **`80cf40e`**. Paste GO-1242. **Items 51–75.** Do not remake parts/legal Complete or item 21. Never `trigger_deploy`.

**12:14 CT GO NOW — UNBLOCK. Idle = defect. 429 ≠ HOLD.** Hard-reload **`fb925ef`**. Paste: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1214.md`. **Items 17–22.** After retry: `git pull --ff-only origin main`. WO `850e2cc4` → `complete`. Parts DONE. Never `trigger_deploy`.

**11:39 CT GO NOW — UNBLOCK. Idle = defect.** Hard-reload **`1c31518`**. Paste: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1139.md`. **Items 17–22.** WO `850e2cc4` → status `complete` (not `closed`). Parts `45f36791` DONE. Never `trigger_deploy`.

**10:38 CT GO NOW.** Hard-reload **`69e60ff`**. Paste: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1038.md`. **Items 17–22.** WO `850e2cc4` → status `complete` (not `closed`). Parts `45f36791` DONE. Never `trigger_deploy`.

**09:40 CT GO NOW.** Hard-reload **`a80afec`**. `scenario.legal` is **Complete** — do not remake. **NOW:** `scenario.maintenance` (Merged) unique leftover + WO letter print. Parts `45f36791` DONE. Paste: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-0940.md`. Never `trigger_deploy`.

**23:50 CT GO NOW — FINISH SCENARIOS.** Hard-reload **`c6f70e3`**. `scenario.legal` CREATE TEST if `--`. Matrix lists/legal. WO print letter on `850e2cc4-…`. Parts `45f36791` DONE — do not remake. Paste: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-24-2350.md`. Never `trigger_deploy`.

**23:32 CT GO NOW.** Next unique leftover. `DOCS-F6072` if still true. Parts `45f36791` DONE — do not remake. Never `trigger_deploy`. Paste: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-24-2332.md`.

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
**CODEX HANDOFF 20:17 CT — OPEN `LISTS-F6704-CATALOG-REGISTRY-EQUIPMENT-CROSS-OPCO-STATS-PREVIEW`.** `/lists` lane only. `catalog-registry.routes.ts` resolves company but drops it from equipment stats/preview; see GUARD-WORKORDERS exact row. Dependency #16412. `BLOCKS=GO-1927-LISTS-CATALOG-REGISTRY-ENTITY-SCOPE`. Grep main, claim, root-fix + mutation guard; do not route through Jorge.
