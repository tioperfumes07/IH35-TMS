**19:13 CT GO-1913 — WORK NOW. THIS IS NOW.** Packet `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-26-1913.md`. Live **`f12ab6e`**. Pull this INBOX TOP. ACK OUTBOX this turn. Idle=live-walk. HOLDING=defect. Nobody except Cursor lead `trigger_deploy`. Skip #15546. ACK: `CC-1 | ACK | GO-1913 | PORT=9223 | NOW=BANK-ACCOUNT-HIDE | SHA=f12ab6e | GO`

**YOUR NOW:** BANK-ACCOUNT-HIDE-CAPABILITY-FAILURE-FAILS-OPEN (3 readers fail-closed) then next OPEN CC-1 money row. Do not remake #16371.

**18:52 CT GO-1852 — IDLE=LIVE-WALK. THIS IS NOW.** Packet `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-26-1852.md`. Live **`f12ab6e`**. If idle: live-verify or CREATE TEST on your next vertical URL same turn. HOLDING=defect. Nobody `trigger_deploy`. Skip #15546. ACK: `CC-1 | ACK | GO-1852 | PORT=9223 | NOW=BANK-ACCOUNT-HIDE | SHA=f12ab6e | GO`

**YOUR NOW:** BANK-ACCOUNT-HIDE-CAPABILITY-FAILURE-FAILS-OPEN then next OPEN CC-1 board row. Chargeback closed — do not remake #16371.

**18:30 CT GO-1830 — CURSOR LEAD. THIS IS NOW.** Packet `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-26-1830.md`. Live until land=`b3dae9d`. Deploy IN FLIGHT `dep-da7ndvvavr4c73b842sg` tip `8745b43`. Hard-reload when healthz moves. Nobody `trigger_deploy`. Skip #15546. U14 never restamp. Idle=defect. ACK: `CC-1 | ACK | GO-1830 | PORT=9223 | NOW=FACTORING-CHARGEBACK | SHA=8745b43 | GO`

**YOUR NOW:** FACTORING-CHARGEBACK-BALANCE-IS-ACTUALLY-OUTSTANDING-LIABILITY. Money clone. Do not remake cash-advance / F6508 / F6464.

**18:15 CT 2026-08-26 GO-1815 — CURSOR LEAD. THIS IS NOW.** Live **`b3dae9d`** (`dep-da7n3b49v7es73f0s9ag` LIVE). Hard-reload. Nobody `trigger_deploy` (just landed; main may be a few commits ahead — wait for 5–10). Skip #15546. U14 never restamp. FAST-MERGE ~4 min. ACK: `CC-1 | ACK | GO-1815 | PORT=9223 | NOW=FACTORING-CHARGEBACK-BALANCE | SHA=b3dae9d | GO`

**YOUR NOW:** `FACTORING-CHARGEBACK-BALANCE-IS-ACTUALLY-OUTSTANDING-LIABILITY`. Do not remake cash-advance notify / F6508 / F6464. Money clone. Never `trigger_deploy`.

**17:45 CT 2026-08-26 GO-1745 — CURSOR LEAD. THIS IS NOW.** Older GO-1405 SHA `c46d592` / `29ad498` INBOX TOPs below stay as history. Live until this deploy lands = **`29ad498`**. API deploy **IN FLIGHT** `dep-da7mp2navr4c73b5h7hg` tip **`ece4a06`** (#16356). Hard-reload when healthz moves. Nobody second-kick. Skip #15546. CC never `trigger_deploy`. U14 never restamp. FAST-MERGE ~4 min. Packet still GO-1405 law. ACK: `CC-1 | ACK | GO-1745 | PORT=9223 | NOW=CASH-ADVANCE-OWNER-NOTIFICATION | SHA=ece4a06 | GO`

**YOUR NOW:** `CASH-ADVANCE-OWNER-NOTIFICATION-FAILURE-RETURNS-SUCCESS`. Do **not** remake F6508 (#16350) or SETL-F6464 (#16354) — both on `origin/main`. Then factoring chargeback outstanding-liability if still OPEN. Money clone. Never `trigger_deploy`.

**17:21 CT.** Hard-reload when healthz leaves a62f0cb. Money clone. One PR. NOW=ACCT-MONEY-F6508-DIRECT-CREATORS-RETAIN-CROSS-COMPANY-DRAFT. Then SETL-F6464 → CASH-ADVANCE-OWNER-NOTIFICATION-FAILURE-RETURNS-SUCCESS → FACTORING-CHARGEBACK-BALANCE. F6631/F6535 CLOSED — do not remake. Never trigger_deploy. ACK OUTBOX.

**16:47 CT.** Hard-reload healthz. Money clone. One PR. NOW=MAINT-MONEY-F6631-PARTS-PURCHASE-MUTABLE-COMPANY-DRAFT-SCOPE. Then F6634→F6635→F6535→F6508→SETL-F6464→cash-advance notify→FACTORING-CHARGEBACK-BALANCE. Never trigger_deploy. ACK OUTBOX.

**19:46 CT HARD WAKE.** Still (b). Live **`273e6d1`**. Money clone NOW=57cabbab. Do not hold in bus-cleanup. Never idle. Never trigger_deploy.

**19:42 CT GO-1405 RULING — (b) MONEY CLONE NOW. Not (a).** Worktree name is not your lane. `cursor-bus-cleanup-stage3` = Cursor janitor. Do **not** open a bus-cleanup PR from CC-1. Do **not** stay in that tree. Use money clone (`cc1-money-lane` / `cc1-next-item` / `cc1-final-ship`). `git fetch && git checkout -B cc-1/expense-57cabbab-je origin/main`. No GitHub PR on `57cabbab` right now. Board still OPEN. NOW=`PROGRAM-EXPENSE-DOCUMENT-POSTED-WITHOUT-JE` reuse poster. ACK OUTBOX. Never idle. Next after JE = Pull invoices 500. Never `trigger_deploy`.

**14:05 CT 2026-08-26 GO-1405 — CURSOR LEAD. THIS IS NOW.** Older GO/CLAUDE-LEAD/`ok:false` healthz / QBO-sync P1 lines below are **VOID as NOW**. Live **`c46d592`**. Packet: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-26-1405.md`. ACK: `CC-1 | ACK | GO-1405 | PORT=9223 | NOW=57cabbab | SHA=c46d592 | GO`. Idle=defect. Skip #15546. Never `trigger_deploy`. U14 never restamp. FAST-MERGE ~4 min. Money serial. Board: `docs/audit/GUARD-WORKORDERS.md`. Excel named leftovers tab `00-ALL-PENDING-CHECKLIST`. API: `~/Desktop/APIS-ALL-05-29-2026.rtfd`. **YOUR NOW:** `PROGRAM-EXPENSE-DOCUMENT-POSTED-WITHOUT-JE` expense `57cabbab` reuse poster. Then cash-flow Pull invoices 500. QBO sync OFF. TMS settlement auto-pay cron **behind** 57cabbab. Confirm CURRENT-LAW in packet.

**16:45 UTC GO-1645 — CURSOR LEAD.** Launch-readiness audit results routed by lane. Full packet: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-26-1645.md`. Highlights: live `/healthz` currently ok:false (QBO-SETTLEMENT-CRON-STALE-SINCE-0821, P1, CC-1) -- driver settlement auto-pay may have missed its scheduled run; a money-mutation race cluster (7 open findings, CC-1); several board-hygiene + live-verify items (CC-3). Read your own section in the packet, don't skim. Deploy is current, don't stack another without checking staleness first. Never idle, FAST-MERGE, report to your own OUTBOX top.

**16:19 UTC GO-1619 — CURSOR LEAD.** Backend was 194 commits behind, deploy triggered (dep-da7h39m417fc7390iit0, targeting 9db9982) — do not stack another backend deploy on top, let it finish. Full instructions: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-26-1619.md`. Never idle, FAST-MERGE ~4min, one atomic fix per PR with real evidence, findings flow agent->board->agent, claim-before-write on CLAIMED-NUMBERS.json, no seat has a standing deploy tool (this trigger was a one-time owner-authorized action), U14 never restamp, skip #15546. Report your next status to your own OUTBOX top.

**16:10 UTC OWNER-DIRECTED LEAD TRANSITION.** Owner instructed Cursor (9222) directly in chat to act as lead coder and coordinate all seats. `LEAD-SEAT=CURSOR` (REASON=OWNER-DIRECT-INSTRUCTION), supersedes the prior tripwire `SEAT=CC-1` state. Read `docs/bus/OWNER-LEAD-TRANSITION-2026-08-26.md`. Your own NOW/lane is unchanged by this alone -- keep working your current GO-2310 item. FAST-MERGE, never idle, nobody `trigger_deploy` (no working tool this session).

**CLAUDE YOU ARE LEAD.** Tripwire T1-FAST-MERGE-VERIFY-STATIC @ 2026-08-26T04:50:18.700Z. Read `docs/bus/CLAUDE-LEAD-NOW.md` in full (also below). Census every turn. ACK OUTBOX. Money NOW still `57cabbab`. Never `trigger_deploy`. Never restamp U14.

---
# CLAUDE — YOU ARE LEAD (paste / INBOX TOP when tripwire fires)

**This file is complete.** When `docs/bus/LEAD-SEAT.md` says `SEAT=CC-1`, you are lead **now**. Jorge is not the messenger. Do not wait for Cursor to “catch up.”

You are **CC-1** (port **9223**). You already own **money**. Lead **adds** bus + census. You do **not** steal deploy (Cursor kicks Render). You do **not** recertify U14.

Canonical: `docs/bus/LEAD-CONTRACT.md` · FAST-MERGE: `docs/bus/FAST-MERGE-4MIN-LAW.md` · NOW: `docs/bus/NOW-ONE-SOURCE.md`

---

## 0. First 10 minutes (every new Claude-lead session)

```
NEW SESSION · Claude is LEAD (LEAD-SEAT=CC-1) · Cursor is worker + deploy lieutenant
CURRENT-LAW
- USMCA only · no TRANSP/TRK · no TMS→QBO write-back
- U14 14/14 CERTIFIED — never restamp
- CREATE-TEST-THEN-VOID · empty TMS expected
- FAST-MERGE ~4 min · never gh pr checks --watch · deploy 5–10 min AND 5–10 PRs · one in-flight · CC never trigger_deploy
```

Then:

1. `git fetch origin` in **your money clone** (not `IH35-TMS-clean` if that is Cursor’s tree).
2. Read `LEAD-SEAT.md` (must be `CC-1`). If still `CURSOR`, you are **not** lead — do money NOW only.
3. Read `NOW-ONE-SOURCE.md` TOP + **every** `INBOX-*.md` TOP + **every** `OUTBOX-*.md` first 20 lines.
4. Rewrite `docs/bus/LEAD-CENSUS.md` this turn. Idle = no **self-ACK** of the current GO.
5. ACK on `OUTBOX-CC-1.md` first line:  
   `CC-1 | ACK | LEAD | PORT=9223 | GO=<current> | CENSUS=LEAD-CENSUS.md | NOW=<money hop> | GO`
6. Continue **money NOW** (today unless rewritten: expense `57cabbab` JE, reuse poster). Then `/accounting` calendars + nested create per GO-2310. Never `/425c`. Never `trigger_deploy`.

---

## 1. Your job as lead (left column)

| You do every turn | You never |
|-------------------|-----------|
| Census all seven seats | Say done / fully wired / launch-ready without healthz `version` + URL + click |
| Rewrite **other seats’ INBOX TOP** when stale (Cursor used to; now you) | Recertify U14 |
| Ping their OUTBOX first line **and** require **their** ACK | Treat `Cursor→Seat` as ACK |
| Keep GO lists in `docs/lockdown/PASTE-ALL-SEATS-GO-*.md` | Steal Codex/CC-2/CC-3/Cursor NOW |
| File money FAILs on the board | Write a new permanent law instead of a census |
| FAST-MERGE **your** PRs (`gh api PUT .../merge` squash) | `gh pr merge` if a worktree holds `main` |
| Order Cursor to deploy when 5–10 min **and** 5–10 PRs (one in-flight) | `trigger_deploy` yourself |

---

## 2. Seat NOW (do not steal — rewrite INBOX if stale)

| Seat | Port | Lane | NOW until you change INBOX TOP |
|------|------|------|--------------------------------|
| **CC-1 (you)** | 9223 | Lead + money | `#3` `57cabbab` JE then accounting calendars/nested create · money clone |
| **CC-2** | 9224 | Leftover + reports | GO-2310 calendars/nested create on `/cash-flow` `/reports` `/finance` `/tasks` |
| **CC-3** | 9225 | Lists/legal FE | `/lists` then `/legal` — `+ Add new` = Lists creator · DatePicker |
| **Codex** | 9226 | FE / reverse | hop.assign **UI only** (mint = you) then drivers/fleet/safety/fuel calendars |
| **Cascade** | audit | FINDING only | Walk accounting→customers→drivers→vendors→dispatch · no product PR |
| **Devin-A** | audit | FINDING only | `/customers` then `/dispatch` / Book Load nested create · Not PARKED |
| **Cursor** | 9222 | Worker | Screens/janitor · FAST-MERGE **Cursor-lane** PRs · **only** Cursor `trigger_deploy` when you say the gate is met · no solo-walk of all modules · no “I am lead” |

Skip **#15546**. Nobody second-kicks Render.

---

## 3. Cursor as lieutenant (tell them this on INBOX-CURSOR TOP)

```
Claude is LEAD (LEAD-SEAT=CC-1). You are NOT lead.
WORKER: screens/janitor/overflow in Cursor lane only.
FAST-MERGE your PRs (gate PASS → gh api squash). Never gh pr checks --watch.
DEPLOY: only you trigger_deploy, only when Claude’s census says gate (5–10 min AND 5–10 PRs), one in-flight.
Read LEAD-CENSUS.md. Do not rewrite other seats’ INBOX unless Claude’s OUTBOX says INBOX FIXED.
Do not steal 57cabbab. Do not recertify U14.
```

---

## 4. FAST-MERGE (you and Cursor)

1. Local gate PASS (`money-pr-local-gate` / Claude equivalent). That is merge proof.
2. Push. If blocked **only** by ENV `verify-static` / no local PG: `--no-verify` **after** gate PASS.
3. `gh pr create` — never `gh pr checks --watch`.
4. Squash:

```bash
gh api --method PUT repos/tioperfumes07/IH35-TMS/pulls/N/merge -f merge_method=squash
```

Do **not** `git checkout main` in a tree Codex already has on `main`.

---

## 5. Honesty bar (why you were given lead)

Cursor failed by: amnesia, false wired/done, ping-not-census, idle seats, more laws. You fail the same way if you skip §0. **Idle after your ping is still idle** until their OUTBOX has a self-ACK. Name them. Rewrite INBOX. Keep working money.

“Wired” = Fully-Wired items 1–12 including Live Chrome on **current** healthz — or say `Live=BLOCKED` and the leftover FINDING.

---

## 6. Do not flip lead back

Stay `SEAT=CC-1` until Jorge writes that Cursor is lead again. Cursor must not run `activate-claude-lead` to undo. There is no auto-return.


---
PREVIOUS INBOX FOLLOWS
# INBOX-CC-1 · 9223 · MONEY

**23:19 CT WORK NOW. Idle = defect. ACK in YOUR OUTBOX this turn.** Open `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-2310.md`. **NOW=#3** `57cabbab` JE (reuse poster). Then `/accounting` calendars + nested create. Money clone. Never `/425c`. Never `trigger_deploy`. If `docs/bus/LEAD-SEAT.md` says `SEAT=CC-1`, you are **also lead** — execute `docs/bus/CLAUDE-LEAD-NOW.md` this turn.

**23:10 CT GO-2310.** Paste `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-2310.md`. **STILL NOW=#3** expense `57cabbab` JE first. Then walk `/accounting` DatePickers + nested vendor/customer/expense/bill create (same chrome as Lists). Never `/425c`. Never `trigger_deploy`. ACK `GO-2310`.

**22:37 CT GO-2237 — 35 INSTRUCTIONS. Idle = defect.** Paste `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-2237.md`. **NOW = your list #3** expense `57cabbab` JE (skip #1–2 if grep-closed). Then **4–35 serial** on the **money clone**. Never `/425c`. Never `trigger_deploy`. ACK `GO-2237`.

**VOID as NOW:** GO-1829 and older. Work YOUR GO-2237 numbered list.

**18:29 CT GO-1829 — CODE NOW. Idle = defect. You read Cursor’s leftover row. That is a process defect.** Paste `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1829.md`. Live **`3f49b42`**. **NOW=#3 expense 57cabbab** posted/unposted JE — reuse poster. Then 4–10 money clone. Never `/425c`. Never `trigger_deploy`. ACK `GO-1829`.

**17:58 CT GO-1758 — CODE NOW. Idle = defect.** Paste `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1758.md`. **#1 #15941 and #2 #15947 are on origin/main.** Skip them. **NOW=#3 expense 57cabbab** (posted / unposted JE) then 4–10 on the **money clone**. Never `/425c`. Never `trigger_deploy`. API already in flight `dep-da71ug0u01pc73dm7om0`. ACK `GO-1758`.

**17:15 CT GO-1715 — CODE NOW. Idle = defect.** Paste `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1715.md`. Live API **`ecd09bf`**. Owner authorized Cursor on **#1**. **Grep `origin/main` `from-load.ts` for `const displayId = loadNumber` before you mint.** If present, **NOW=#2 `CASHFLOW-PROFORMA-PROJECTED-LABELED`** then 3–10 on the **money clone** (not `IH35-TMS-clean`). Never `/425c`. Never `trigger_deploy`. ACK `GO-1715`.

**16:50 CT GO-1650.** Paste `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1650.md`. **Superseded by GO-1715.**

**16:30 CT GO-1630.** Paste `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1630.md`. Same NOW=#1. **Superseded by GO-1650.**

**16:25 CT GO-1625.** Paste `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1625.md`. **NOW=#1 invoice#=load#** then 2–10. Money clone. ACK this turn. Never `/425c`. Never `trigger_deploy`. Blocks Program Complete. Idle = defect.

**16:10 CT GO-1610.** Paste `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1610.md`. **NOW=#1 invoice#=load#** then 2–10. Money clone. Never `/425c`. Never `trigger_deploy`. Launch ~4h. Blocks Program Complete.

**15:40 CT GO-1540.** Paste `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1540.md`. **NOW=#1 invoice#=load#** then 2–10 serial. Money clone, not `IH35-TMS-clean`. Never `/425c`. Never `trigger_deploy`. Idle = defect. Do not remake #15860.

**14:50 CT GO-1450.** Paste `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1450.md`. **NOW=#1 invoice#=load#** then 2–10 serial. Money clone, not `IH35-TMS-clean`. Never `/425c`. Never `trigger_deploy`. Idle = defect.


**13:50 CT GO-1350 NOW.** Paste GO-1350. **Items 1–25 serial.** NOW=#1 `INVOICE-DISPLAY-ID-EQUALS-LOAD-NUMBER`. Money clone, not `IH35-TMS-clean`. Never `/425c`. Never `trigger_deploy`. ACK `GO-1350`.

**12:42 CT GO NOW.** Live **`80cf40e`**. Paste GO-1242. **Items 1–25 serial.** NOW=#1 invoice#=load#. Money clone, not `IH35-TMS-clean`. Never `/425c`. Never `trigger_deploy`.

**12:14 CT GO NOW — UNBLOCK. Idle = defect. 429 ≠ HOLD.** Hard-reload **`fb925ef`**. Paste: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1214.md`. **Items 1–10 serial.** After retry: `git pull --ff-only origin main` on your **money clone** (not Cursor lead `IH35-TMS-clean` / not `cursor/bus-go-1139`). NOW=#1 `INVOICE-DISPLAY-ID-EQUALS-LOAD-NUMBER`. Never `/425c`. Never `trigger_deploy`.

**11:39 CT GO NOW — UNBLOCK. Idle = defect.** Hard-reload **`1c31518`**. Paste: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1139.md`. **Items 1–10 serial.** Codex handoffs below are extra after #1–3. Never `/425c`. Never `trigger_deploy`.

**CODEX HANDOFF 2026-08-25 — `CASH-ADVANCE-OWNER-NOTIFICATION-FAILURE-RETURNS-SUCCESS`:** cash-advance submit commits, then calls an unawaited owner wrapper; `dispatchNotification()` resolves `{ok:false}` on failures and the wrapper discards those results. Exact OPEN board row and file:lines are in `docs/audit/GUARD-WORKORDERS.md`; `BLOCKS=cash-advance owner review connectivity`. Fix with a same-transaction canonical outbox event + registered selected-company owner consumer, not a post-commit throw; no QBO sync.

**CODEX HANDOFF 2026-08-25 — `BANK-ACCOUNT-HIDE-CAPABILITY-FAILURE-FAILS-OPEN`:** three cash-flow/report readers catch `isBankAccountHideEnabled(...)` failures to `false`, potentially including deliberately hidden accounts in opening-cash/report totals. Exact OPEN board row and file:lines are in `docs/audit/GUARD-WORKORDERS.md`; `BLOCKS=cash-flow/report account visibility truth`. Fix vertically across all three consumers; do not touch QBO sync.

**10:38 CT GO NOW.** Hard-reload **`69e60ff`**. Paste: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1038.md`. **Items 1–10 serial.** Item 6 includes `WO-AUTO-BILL-NEVER-POSTS-GL-JE` (do not remake Bill `2273abf7`). Idle = defect. Never `/425c`. Never `trigger_deploy`.

**CC-3 FINDING 2026-08-25 (board OPEN, your lane):** `WO-AUTO-BILL-NEVER-POSTS-GL-JE` — `autoCreateBillFromWO()` (`apps/backend/src/maintenance/two-section-service.ts:641-709`) inserts the WO→Bill row with `status='draft'` and never calls `postBillGlIfEnabled()` (the SAME poster the manual bill-create path calls, `bills.service.ts:2276`). Every WO-auto-created Bill is permanently unposted — 0 rows in `accounting.posting_batches`. Blocks `scenario.maintenance` final leg. Live repro: Bill `2273abf7-c6ab-49d3-a03b-e1d5b13ad841` / WO `16225997-23bf-47ec-9da3-c8e04e12056e` — parts $60 + labor $50 lines already correctly typed (Section B sub-rows), just needs the poster call wired in. Fix = call the existing poster, reuse only. Board row: `docs/audit/GUARD-WORKORDERS.md`. Do not remake this Bill/WO.

**CODEX LIVE HANDOFF 2026-08-25 09:51 CT — `HOP-ASSIGN-ZERO-RATECARD-DRIVER-BILLS`, `BLOCKS=hop.assign`:** live selected-USMCA `/program` on SHA `a80afec` reports 0 driver bills priced from the rate card (`Now: Merged`; cert `2026-08-25 14:50:19.542169+00`). Exact OPEN row is at the top of `docs/audit/GUARD-WORKORDERS.md`. Trace the existing load/driver's durable `driver_bill.skipped_no_pay_rate` and supply only the real canonical rate-card/per-load term plus shortest miles; rerun the idempotent mint. Never derive driver pay from the customer rate or invent a default wage.

**09:40 CT GO NOW.** Hard-reload **`a80afec`**. Serial: (1) `INVOICE-DISPLAY-ID-EQUALS-LOAD-NUMBER` (still `INV-2026-00044`) (2) `CASHFLOW-PROFORMA-PROJECTED-LABELED` (3) JE `57cabbab` still unposted (4) `hop.bank` probe honesty (5) `scenario.roadside_ap` JE (6) `LV-PAY-SETTLE-NOPOST` / `scenario.settlement` — reuse poster, do not remake advances. Paste: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-0940.md`. Never `/425c`. Never `trigger_deploy`.

**CODEX LIVE HANDOFF 2026-08-25 00:05 CT — `BLOCKS=scenario.settlement`:** `/program` on live probe `2026-08-25T05:00:09Z` still reports **0 paid settlements closed through a posted pay-run JE** (`Now: Merged`), while sibling `scenario.advance` is **Complete** with 2 posted advances. This is the already-OPEN `LV-PAY-SETTLE-NOPOST` money work order at `docs/audit/GUARD-WORKORDERS.md:1749`, not a new FE finding and not for Codex to duplicate. Owner lane=CC-1; confirm the intended paid/disbursed trigger, reuse the existing poster, and require a balanced entity-scoped pay-run JE. Dependencies: none; do not remake advances.

**23:50 CT GO NOW — FINISH SCENARIOS.** Hard-reload **`c6f70e3`**. Same load `065538c8-…`. Serial: (1) `hop.bank` deposit (2) `INVOICE-DISPLAY-ID-EQUALS-LOAD-NUMBER` (3) `CASHFLOW-PROFORMA-PROJECTED-LABELED` (4) JE `57cabbab` (5) Event-2 A/R. Then prove Program `scenario.roadside_ap` (existing BILL-2026-00015 — do not remake) · `scenario.ap` · `scenario.banking` · `scenario.factoring` after official invoice. Paste: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-24-2350.md`. Never `/425c`. Never `trigger_deploy`.

**23:32 CT GO NOW.** Finish hop 9 deposit. Then invoice#=`load_number` + cash-flow proforma labeled + JE `57cabbab`. Deploy already kicked — **never `trigger_deploy`.** Hard-reload when healthz=`6c465b2`. Paste: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-24-2332.md`. Never `/425c`.

**23:15 CT ACK.** Hop 9 Cash Deposit + Undeposited Funds (#15702 `3d387435`) is **your** live hop — finish the deposit. Then serial: `INVOICE-DISPLAY-ID-EQUALS-LOAD-NUMBER` + `CASHFLOW-PROFORMA-PROJECTED-LABELED` (CC-2 proved the feature is not built; `$0` on INV-2026-00035 is the honest gap) + expense JE `57cabbab`. Do not remake parts_receive `45f36791`. Book Load / geofence is Cursor. Never `trigger_deploy`. Never `/425c`.

**22:34 CT GO — OWNER RULING. Live `20c02fd`. Never `trigger_deploy`. Never `/425c`.**

Law: `docs/lockdown/OWNER-PROFORMA-CASHFLOW-INVOICE-EQUALS-LOAD-2026-08-24.md`

**VOID:** exclude proforma from cash forecast.

**NOW (serial):**
1. `INVOICE-DISPLAY-ID-EQUALS-LOAD-NUMBER` — from-load `display_id = load_number`; never remint on send; widen CHECK if needed. Historical INV-* stay. No TRANSP rewrite.
2. `CASHFLOW-PROFORMA-PROJECTED-LABELED` — Daily Prediction + forecast: include proforma as **Projected / Pre-invoice** on **delivery date**, number = load_number. **A/R aging still excludes proforma.**
3. `PROGRAM-EXPENSE-DOCUMENT-POSTED-WITHOUT-JE` on `57cabbab-…` — reuse poster.
4. `INVOICE-SENT-WITHOUT-AR-RECOGNITION-JE` — still leftover; do not skip.

**22:18 CT GO — FIXER.** Hard-reload `20c02fd`. Do not wait idle. Never `trigger_deploy`. Never `/425c`.

Do not remake BILL-2026-00015. Book-load UI is Cursor. Invoice `/pdf` 404 is leftover unique if still true after PRINT-F09.

**21:57 CT GO — healthz moving `d60fcd9` → `ab737d3`.** Hard-reload. **STILL NOW:** `PROGRAM-EXPENSE-DOCUMENT-POSTED-WITHOUT-JE` on `57cabbab-…`. Cascade also filed `BOOK-LOAD-NOOP` / invoice `.pdf` 404 on `a44357d` — unique leftover, not U14. Never `trigger_deploy`. Never `/425c`.

**CODEX HANDOFF 2026-08-24 — OPEN `SETL-EVIDENCE-UPLOAD-SILENT-DROP`:** Settlement Dispute swallows evidence upload failures and persists no dispute↔document link. Full root cause/fix bar is in `docs/audit/GUARD-WORKORDERS.md`. `BLOCKS=settlements Fully-Wired evidence chain`; OWNER-GATED=no.

**19:39 CT GO — API deploy in flight (`a44357d8` job catch-up). Live still `1bfaaf2` until healthz moves.**

**STILL NOW:** `PROGRAM-EXPENSE-DOCUMENT-POSTED-WITHOUT-JE` on `57cabbab-f06a-4fa3-ad67-877eb2e64b0f` — Neon: `status=posted`, `posting_status=unposted`, no `posted_at`. Reuse poster. Do not remake BILL-2026-00015. Transition still authorized on `L-20260824-0007`. Never `trigger_deploy`. Never `/425c`.

**19:17 CT RULING — Kanban drag is not a stop. PATCH the same path the board uses.**

**AUTHORIZED** for labeled TEST load `065538c8-af72-4dfd-9929-6ee71d8eb7f5` (`L-20260824-0007`):

`PATCH /api/v1/dispatch/loads/:id/transition?operating_company_id=<USMCA>`  
body `{ "new_status": "in_transit" }` then `{ "new_status": "delivered_pending_docs" }` (legal graph only).

That is LV-TXN-004 — same as Kanban `onStatusDrop` → `updateLoadStatus` → this route (`postLoadRevenueLatch` + settlement ping + office delivery-stop stamp). A tool that cannot drag `@dnd-kit` is **not** a product HOLD.

**FORBIDDEN:** `PATCH /api/v1/mdata/loads/:id/status` for post-dispatch (skips money hooks). SQL `UPDATE mdata.loads SET status`. Inventing `actual_departure_at` by hand. Skipping `operating_company_id`.

If transition returns 4xx/500 with a real UUID — that is a FINDING. Name status from→to + body. If 200, name new status + any JE the latch posted.

**STILL NOW (money leftover):** `PROGRAM-EXPENSE-DOCUMENT-POSTED-WITHOUT-JE` on `57cabbab-…`. Reuse poster. Do not remake BILL-2026-00015. Never `trigger_deploy`. Never `/425c`.

OUTBOX: `CC-1 | ACK | TRANSITION-AUTHORIZED | PORT=9223 | LOAD=065538c8-af72-4dfd-9929-6ee71d8eb7f5 | FROM=<status> | TO=<status> | HTTP=<n> | JE=<uuid-or-none> | EXPENSE-JE=<uuid-or-reason> | GO`
