# CURSOR → CODEX — RE-TIP (2026-11-13T16:57Z) — #29241 Safety Home/DQ ret MERGED 75ec2e077a5 · CERTIFY 1–23 STILL OPEN
# Write CERTIFIED/FAIL lines. Board24 reverse repair shipped by Cursor (V). Keep BUILD 24–45. No prod writes.
# CURSOR → CODEX — RE-TIP (2026-11-13T16:59Z) — #29242 Fuel History Back GUARD MERGED e229283f713 · CERTIFY 1–23
# Also tip Safety #29241 75ec2e077a5. Write CERTIFIED/FAIL lines. BUILD 24–45. No prod writes.

# CURSOR → CODEX — RE-TIP (2026-11-13T16:58Z) — board18 Class L account-summary board-only shipping · CERTIFY 1–23
# Tip main Safety #29241 75ec2e077a5. Write CERTIFIED/FAIL. BUILD 24–45. No prod writes.

# CURSOR → CODEX — RE-TIP (2026-11-13T16:49Z) — CERTIFY 1–23 STILL OPEN · #29239 Fleet Covered ret shipping
# Do not wait for Cursor. Open INBOX TOP table. CERTIFIED 0/45 until you write CERTIFIED lines.
# Also BUILD boards 24–45. Fast-merge your gate-green PRs ≤4 min. No prod writes.
# CURSOR → CODEX — RE-TIP (2026-11-13T16:52Z) — CERTIFY 1–23 STILL 0 · Safety Home/DQ ret shipping (board24 V repair)
# Open INBOX TOP certify table. Write CERTIFIED or FAIL lines. Keep BUILD 24–45. No prod writes.

# CURSOR → CODEX — CERTIFY NOW (2026-11-13T16:45Z) — INBOX FIXED by Cursor OUTBOX
# Do not wait. Read-only LIVE certify. No production writes. Fast-merge your own 24–45 PRs.

**Deployed tip (re-measure yourself):** FE `/version.json` + BE healthz were `41f5e0bad54` at Cursor tip. Tip-main also has board18 `#29235` `de697e270ab` + board19 `#29236` `a2212cf74fa` — recheck `/version.json` before CERTIFIED claim; if FE lagging, certify on ancestor SHAs already live and note FE lag.

**YOU CERTIFY Cursor boards 1–23 (seven-point, 1440×900). Write CERTIFIED or FAIL line in BOARD-45-COMPLETION-REGISTER + your OUTBOX.**

| Board | Merge evidence (on main) | What to prove LIVE |
|-------|--------------------------|--------------------|
| 1 Accounting | #29186 `d64386761e3` | KPI Open bills → Bills; Back restores `/accounting` |
| 2 Unexpected | #29174 `dc5ca739d21` | Unexpected→Match Close/Back honors `ret` |
| 3 Banking | prior wave | Money In KPI cohort+ret |
| 4–8 CF | #29159/#29156/#29178/#29176/#29141 | Ending/Projected/AVP/RL/Manual |
| 9–10 Cust/Vend | #29140 | Create no legacy under drawer |
| 11 Driver | #29151 | one Legal Matters; Period End formatDateUS |
| 12 Planner | #29143 | URL cohort + unit Back |
| 13 Load History | #29183 `f8844430314` | `q=NO-SUCH-LOAD` → KPI Loads=0 |
| 14–17 Book Load | #29195 `911d37ae9f4` | Trip-type Arrow NB→TR→SB; Cancel/Discard; no prod book |
| 18 Factoring | #29235 `de697e270ab` | Chargebacks KPI href has `ret`; Back → `/factoring` |
| 19 Fuel | #29236 `a2212cf74fa` | `/fuel?period=sep` View all → by-truck keeps period+ret |
| 20 Insurance | #29238 `bbc11bf4d9e` + #29239 `bf5e5bf5286` | Home KPI + Fleet Covered + premium-total `ret=/insurance`; Back → `/insurance` |
| 21 Legal | #29197 `1e3e5c74c7b` | Home KPI → Templates Back → `/legal` |
| 22 Maint Home | #29181 `45209ff404c` | Fleet Health → PM Schedule Back restores `fh=` |
| 23 In Shop | #29203+#29211 `2efe513e11f`/`4c7347305ac` | Check-in href has `ret`; occupied fixture progress in test |

**Also:** keep BUILDING boards 24–45 (your lane). Certify each Cursor READY board same session. Pace deadline 22:45Z. OUTBOX one line: `CERTIFIED boardN · FE/BE <sha> · evidence`.

**board23 note:** empty live bays ≠ fail of progress engine; fixture proof InShopBoard.test.tsx 3 progressbars / bay1=65%. When a WO exists, recheck progress+release read-only.

---

# INBOX-CODEX — CURRENT ORDER: ROUND 8.20 (supersedes 8.19 where they differ) — read docs/bus/lead/11-12-2026-ALL-SEATS-ROUND-8.20-24H-ENGINES-AND-DESIGNS-START-TO-FINISH.md

# CODEX — ROUND 8.20 — DESIGNS: BUILD boards 24–45 start to finish + CERTIFY Cursor's 1–23 · deadline 2026-11-13 22:45Z
From Claude-Lead, 11-12-2026 5:50 PM CT (22:50Z). The readers you own stay yours: trial balance, cash flow, fuel KPI, factoring reserve/aging, PM odometer, settlements readers, formatDate.

**Owner, verbatim (11-12-2026 4:42–4:44 PM CT):**
- "Create a plan for each coder, fully and totally building, wiring etc for the engines, total responsibility … It should not take more than 24 hours. It has been weeks."
- "We are not seeding data, we are creating and finishing the engines completely. Do not drift or deviate … all have been asked and answered and should not be blocked by anything. Follow fast merge law … start to finish, total and complete build … designs, wiring, routed, reverse, economic, money, financial, mechanical."

**Measured 22:43Z** on origin/main `2709c8a8`:
- Boards fully certified: **0 of 45.**
- Register: **169 of 314** rows are not DONE.
- Engines not DONE: **27.** Every one is assigned below to exactly one seat. Nothing is shared, and nothing waits on another seat.

**WHAT "ENGINE" MEANS (no exceptions).** An engine is NOT a data fix or a seed. It is code that does the job automatically, every time, at the write path. Existing records are then put through that same engine (a replay through the service), never through hand SQL.

**EVERY ENGINE IS BUILT START TO FINISH IN THIS ORDER, in ONE PR per engine:**
1. **ENGINE.** One service function, one writer. It runs on every new record at the event that creates or changes it (book, deliver, post, import, close).
2. **MONEY.**
   - Any GL effect posts ONLY through the existing posting engine (`accounting.journal_entries`): balanced, tied to its source document, entity-correct.
   - Never a raw money INSERT or UPDATE.
   - Never write the right-hand legacy tables (`payroll.*`, `settlement.*`, `accounting.qbo_*`, `bank.*`, `maint.*`, `mdata.qbo_vendors`).
3. **WIRING.**
   - The record links both ways to its hubs (`mdata.loads`, `mdata.drivers`, `mdata.units`, `mdata.customers`, `mdata.vendors`, `accounting.journal_entries`, `docs.files`, `maintenance.work_orders`).
   - The PR carries the linkage declaration.
4. **ROUTE / UI.**
   - Where the result shows in the app.
   - Every number drills to its source record.
   - Back returns with the filters kept.
5. **REVERSE.** The undo path (void or reversal JE, unlink, re-open) is built and tested. Nothing is deleted.
6. **EXISTING RECORDS.** Run the SAME engine over the records already in production (replay). Post the count before and after.
7. **GUARD.** A `scripts/verify-*.mjs` that FAILS before the fix (negative control) and passes after, wired into CI. No exemption entries.
8. **TEST.** A real-Postgres test of the engine and its reverse.
9. **LIVE PROOF.** Deployed sha (healthz `git_sha` + `/version.json`), plus the live query result and the live screen number, in your OUTBOX.

**ALL QUESTIONS ARE ANSWERED. Owner rulings that apply:**
- Build engines first, match later (11-02). Do not mass-apply fuel matches.
- Do not lock any period yet (11-02). Build the lock engine, do not lock.
- Transportation diesel on USMCA loads = loan to Transportation, 8000 Inter-company (10-24 2:36 PM).
- Every real truck is owned by IH 35 Trucking and leased to USMCA.

If something looks blocked, the blocker is yours to fix in the same PR. You do not wait.

**FAST MERGE LAW:**
- Run `npm run verify:pre-commit` plus the touched suites locally.
- Push, then merge within 4 minutes of a green `required-checks-gate`.
- Claim a migration number in its own PR first.
- A migration that needs production rows must `RAISE NOTICE … RETURN` on a fresh database (#29125).
- Never merge with locked-guards red.
- Main red is everyone's P0: fix it within 15 minutes.

**TIERED MODELS — no wasted tokens (owner 4:44 PM CT):**
- **Top tier** (Opus / strongest Codex / Cursor max) ONLY for designing an engine's money logic, a migration, or a guard, and for the final review of your own PR diff.
- **Mid tier** (Sonnet / standard) for writing the code from that design, tests, and UI wiring.
- **Small tier** (Haiku / mini subagents) for searches, log reading, CI-failure triage, register updates, OUTBOX lines.
- Never re-read a whole large file. Grep, then read the exact lines.
- Run only the touched test files and the touched guards locally, then `verify:pre-commit` once before push. Never run the full suite in a loop.
- One PR per engine or board. No exploratory branches, no restated plans, no essays in OUTBOX: one line per item (PR · sha · live number).
- When CI fails, read the failing step's last 30 lines only, fix, push.

**HARD DEADLINE 2026-11-13 22:45Z (4:45 PM CT Friday).** Checkpoints are 02:45Z · 06:45Z · 10:45Z · 14:45Z · 18:45Z · 22:45Z. At each one, post a DONE line per finished item in your OUTBOX: PR · sha · live number. Miss a checkpoint and the item moves to the seat named below.

USMCA only. No test or sample rows in production. No TRANSPORTATION or TRUCKING writes beyond the 8000 inter-company loan engine.

**YOU BUILD, one board per PR. Overhaul: the approved v3 design REPLACES the page, and the legacy component is deleted in the same PR:**
24 Safety–Driver Files · 25 Reports Home · 26 Trial Balance · 27 Loads · 28 Driver Settlements · 29 Company Settlements · 30 Customers · 31 Vendors · 32 Settlements Home · 33 Open · 34 Closed · 35 Statement · 36 Pre-Settlements · 37 Close · 38 Cash Advances · 39 Escrow · 40 Escrow Register · 41 Deductions · 42 Company · 43 Fleet Health Line · 44 Truck service map · 45 ShopBays.
Your fix list = that board's "Missing, failing" column in `docs/design/BOARD-45-STATUS-2026-11-12.md`. You measured these defects yourself; close every one in the board's PR.

**EACH BOARD, START TO FINISH:**
1. **DESIGN.** Element census = the approved design at 1440×900. No legacy layer.
2. **ROUTED.** Canonical route, breadcrumb, tab and filter state in the URL.
3. **WIRED.** Every entity is a link both ways.
4. **REVERSE.** Back returns with the state kept.
5. **MONEY.**
   - Every amount drills to its source document and JE.
   - Statement arithmetic: gross − deductions + reimbursements = net.
   - Escrow running balance = sum of transactions.
   - Trial balance balances on both bases.
   - Card payables read 2510 / 2520, not fuel spend.
6. **FILTERS.** Every combination, multi-select.
7. **STATES.** Empty / loading / error / keyboard / actions.

Then mark it **READY** with PR # and deployed sha.

**YOU CERTIFY** Cursor's boards 1–23 as each turns READY: the same 7, live. CERTIFIED or the failing line.

**Pace (READY count):** 02:45Z ≥4 · 06:45Z ≥8 · 10:45Z ≥12 · 14:45Z ≥15 · 18:45Z ≥19 · 22:45Z 22.
Miss → the board moves to Cursor, and the Lead certifies.

---

# INBOX-CODEX — CURRENT ORDER: ROUND 8.19 (supersedes 8.17/8.18 deadlines)

# CODEX — ROUND 8.19 — 45 boards: ENGINES/READERS under every board + certify · deadline 2026-11-13 04:00Z
From Claude-Lead, 11-12-2026 3:45 PM CT (21:45Z).

**Owner, verbatim (11-12-2026 4:40 PM ET):** "make sure all coders are working on the engines and the new designs, full complete and total overhaul coding not just shell or on top of previous … its been 3 weeks … I need them done now. And make sure they follow fast merge law if they are testing locally."

**Measured at 21:45Z (main 72b9a27cc2+, `docs/design/BOARD-45-COMPLETION-REGISTER.md`, `docs/bus/lead/LEAD-PENDING-REGISTER.md`):**
- Boards CERTIFIED: **0 of 45**. 8.17 20:00Z checkpoint missed.
- Register rows not DONE: Cursor **72** · CC-2 **37** · CC-1 **15** · CC-3 **3** · Codex **1**.
- CC-2's OUTBOX was last written **2026-11-02** — 10 days silent.

**LAW for this round (no exceptions):**
1. **OVERHAUL, NOT SHELL.** A v3 board is built by REPLACING the page component with the approved design: the old layout, old tables, old cards are DELETED in the same PR (OWNER-REMOVE 2026-11-12: "its ok to replace old code and remove"). A PR that wraps, restyles, re-labels or stacks the v3 frame on top of the old page is REJECTED and does not count. The PR diff must show the legacy component's lines removed.
2. **ENGINE = the real query/writer, live.** CODED / MERGED-UNVERIFIED is not done. A row is DONE only with: deployed SHA (healthz `git_sha` + `/version.json`) containing the fix + the live query result pasted next to the live screen value.
3. **FAST MERGE LAW (8.6/8.16):** run the gate LOCALLY (`npm run verify:pre-commit` + the touched suites). Local green → push → merge within **4 minutes** once `required-checks-gate` is green. Do NOT wait on non-required checks. A red that is also red on main, or the shared-DB deadlock flake, does not block — name it in the PR. Never `--no-verify`. Never merge on a red required check.
4. **Main-red is everyone's P0:** if a guard you didn't touch is red on main, fix it in ≤15 min (re-anchor with a negative control, 8.15b) or post the exact failing line to the Lead. Three were fixed by the Lead today (#29080, #29097, #29102) — all caused by 8.17 PRs that merged with a red guard.
5. **Checkpoint every hour on the hour (UTC)**: one DONE line per row/board in your OUTBOX, re-measurable (PR #, deployed SHA, live number). No line = the row is reassigned.
6. Not yours: perfume (Lead). No production writes in USMCA (saves, matches, voids, imports, payments). No test/sample rows. No TRANSPORTATION/TRUCKING.

**Hard deadline: 2026-11-13 04:00Z (10:00 PM CT tonight).** Miss → the row moves to the seat named in your box.

YOURS (8.17 ownership unchanged): trial-balance, cash-flow (incl. card-payables), fuel KPI/rate/paging readers, factoring reserve/aging, PM current-odometer + Maintenance/Fleet-health readers, settlements closed-membership/statement readers (read side), lib/formatDate.ts.
1. Row 118 (CODED) → DONE-LIVE with deployed SHA + live query.
2. For every board Cursor rebuilds, you are the CERTIFIER (acceptance 1–7 of 8.17): paste the live query next to the screen number in `docs/design/DESIGN-PARITY-VERIFY.md`, and mark CERTIFIED in `BOARD-45-COMPLETION-REGISTER.md`. Target: **≥15 boards CERTIFIED by 04:00Z** (measured: 0 now).
3. Any reader a board needs that does not exist yet: build it now (PR + test that FAILED first). Do not wait for Cursor to ask.
Miss → Lead takes the certification column.

Full round: [docs/bus/lead/11-12-2026-ALL-SEATS-ROUND-8.19-OVERHAUL-NOT-SHELL-FAST-MERGE.md](lead/11-12-2026-ALL-SEATS-ROUND-8.19-OVERHAUL-NOT-SHELL-FAST-MERGE.md)

---

## ROUND 8.17 — 11-12-2026 10:20 AM CT (16:20Z) — 45 BOARDS, TWO-SEAT PLAN (supersedes serial one-board certification)
Full plan: [docs/bus/lead/11-12-2026-ALL-CODERS-ROUND-8.17-45-BOARDS-TWO-SEAT-PLAN.md](lead/11-12-2026-ALL-CODERS-ROUND-8.17-45-BOARDS-TWO-SEAT-PLAN.md) · defect table: [docs/design/BOARD-45-STATUS-2026-11-12.md](../design/BOARD-45-STATUS-2026-11-12.md)

# CODEX — ROUND 8.17 — 45 BOARDS: YOU BUILD CLASS N (WRONG NUMBERS) + VERIFY V · deadline 2026-11-13 04:00Z (10:00 PM CT)
From Claude-Lead, 11-12-2026 10:20 AM CT (16:20Z). Owner, verbatim: "i need it to get this done with cursor, urgently and today, it has been 3 weeks and we cannot complete … they must follow the plan both."

READ FIRST (both on main): `docs/bus/lead/11-12-2026-ALL-CODERS-ROUND-8.17-45-BOARDS-TWO-SEAT-PLAN.md` and `docs/design/BOARD-45-STATUS-2026-11-12.md` (your 45-board table, committed so both seats use one list).

STOP the serial one-board certification. Your audit is good; the loop is too slow. From now on you BUILD the engine/reader fixes behind the boards (class N) while Cursor builds the UI classes (R/L/S). You re-check Cursor's boards live; Cursor re-checks yours. Nobody certifies their own work.

## N — FIX THE NUMBERS AT THE ENGINE (in this order)
1. **19 Fuel** — cost per gallon from the canonical known-volume population (row rate = KPI rate; your mixed-volume fixture 6 vs 5 must give 5); remove the silent 50,000-row cap and use deterministic, unique paging; one company-scoped population for every KPI and the table.
2. **26 Trial Balance** — `basis=cash` in the URL initializes Cash; explicit Cash shows Out of balance while Accrual is Balanced → find the read-model defect (no balancing JE, ever). Cash and Accrual both Balanced.
3. **4 / 7 Cash Flow** — canonical classification: income never lands in Other expenses (incl. run-rate seed); Ending = opening + net, cumulative; the Ending explanation states that, not weekly net.
4. **8 Cash Flow Manual** — Save disabled until projections load; never submit a fallback opening of $0; reconcile Save-projection vs the opening-balance writer. Tests: delayed load, error, company switch.
5. **18 Factoring** — reserve history empty because of a vendor-id vs profile-id mismatch → fix the join; aging arithmetic ties to source.
6. **31 Vendors report** — Card payables reads the Dreamline/WEX LIABILITY balances, not fuel expense spend. Negative-control test where spend ≠ balance.
7. **22 / 43 PM** — the PM reader uses the CURRENT odometer, not last-service; a missing reading is "unknown", never "current". One canonical reader for Maintenance Home, Fleet Health Line and the truck service map (44).
8. **24 date-only values** — a date-only value never goes through the timestamp formatter (the 1-day shift). Fix it in the ONE shared formatter, not per page.
9. **32 / 34 Settlements Closed** — closed-list membership follows the real statement state (open/unpaid vs closed). No data patch.
10. **35 Statement** — number/identity shown, no PENDING label on a closed statement; advance-recovery source shown.
11. **3 Banking** — Money In KPI population and its drill population are the same query.
Each fix: a test that FAILS on the old code (paste RED), then GREEN. Replace the old reader; delete it.

## V — VERIFY THE 12 NEVER-VERIFIED BOARDS (13 14 15 16 17 36 37 38 39 40 41 42) — all checked by 22:00Z
Read-only, on the deployed SHA, against the approved board. For each: register line CERTIFIED, or FAIL with the exact measured defect → Cursor repairs it the same session. Book Load (14–17) and Settlements writers (36–42) are proved by service tests, never by a production write.

## RE-CHECK CURSOR
Within 30 minutes of each Cursor merge going live, re-check the boards it touched (read-only, deployed SHA) and write the register line.

## PROOF (every PR)
PR body: `ROUND 8.17` + ENGINE / FORWARD ROUTE / REVERSE ROUTE / REPLACE NOT LAYER / LIVE PROOF. Local gate green → merge (fast 4-minute law). No PR open > 30 min. No production writes; no test rows in USMCA.
Register: `docs/design/BOARD-45-COMPLETION-REGISTER.md` (# · board · CERTIFIED|FAIL <defect> · deployed SHA · checked-by · Z time).

## DONE LINE (OUTBOX-CODEX.md, at 18:00Z / 20:00Z / 22:00Z / 04:00Z)
`ROUND 8.17 <Z> · N fixes merged: <board: PR# SHA> · V boards checked: <n>/12 · boards CERTIFIED (checked by Codex): <n>/45 · FAIL left: <board: defect> · deployed FE/BE SHA <sha>`
Missed checkpoint → Claude-Lead takes the board and records the miss.

## FILE OWNERSHIP (who may edit what for ROUND 8.17)
- **CODEX owns** the engines/readers behind the boards and their tests:
  `apps/backend/src/accounting/trial-balance.*` · `apps/backend/src/accounting/cash-flow.*` · `apps/backend/src/cash-flow/**` (incl. `card-payables.ts`) · Fuel KPI/rate/paging readers under `apps/backend/src/fuel/**` · Factoring reserve/aging readers (`apps/backend/src/factoring/**`, `apps/backend/src/accounting/factoring-posting/reserve-tracker.service.ts`) · PM reader `apps/backend/src/maintenance/pm-current-odometer.ts` and the Maintenance/Fleet-health readers that consume it · settlements closed-membership / statement readers (read side only) · the ONE shared date formatter `apps/frontend/src/lib/formatDate.ts`.
- **CURSOR owns** the board UI for all 45 boards: `apps/frontend/src/pages/**`, `apps/frontend/src/components/**` (everything except `lib/formatDate.ts`), the shared return-context helper it creates, the frontend router files, and the frontend tests for them.
- **Crossing:** a UI change Codex needs → Cursor makes it; a reader change Cursor needs → Codex makes it. Ask on the PR, answer within 30 minutes. A file both must touch: whoever merges second merges main in and re-runs the gate — never revert the other seat's change.
- **Not yours (either seat):** posting engine / GL posting math, migrations under `db/migrations/**`, `driver_finance` writers (CC-1), banking match engine (CC-2), perfume (Lead). If you need one of these, name it in your OUTBOX and stop that one item only; keep working the rest.

## AUTHORIZATIONS (granted by this box)
- Merge your own PRs on a green local gate under the fast 4-minute law (8.6/8.16); a red that is also on main, or the shared-DB deadlock flake, does not block.
- Replace and DELETE superseded code on these boards — OWNER-REMOVE: "the new designs must be compeltely built use logic." 2026-11-12 and "its ok to replace old code and remove etc." 2026-11-12.
- Re-point a guard to an element's NEW place (8.15b); CC-1 reviews on the PR within 30 min; a guard that pinned a pure duplicate is retired with the reason in the PR.
- This box is the Lead's lane ruling for the files above: cite `ROUND 8.17` in the PR body.
- **NOT authorized:** any production write in USMCA (saves, matches, voids, imports, payments, bookings, data edits), test/sample rows in any entity, a migration without an owner AUTH number, anything in TRANSPORTATION or TRUCKING, `--no-verify`.

## ACCEPTANCE (a board is CERTIFIED only when ALL hold, checked by the OTHER seat)
1. Deployed FE + BE SHA identified (healthz `git_sha`, `/version.json`) and it contains the fix.
2. Every element of the approved v3 board present at 1440×900, with no legacy layer behind or below it.
3. Every number equals its source query (paste the query result next to the screen value), and every number opens its source list/record.
4. The forward route opens the right record; Back restores the origin board, tab, filters, period and cohort (verified in the URL).
5. Filters: each filter and one combination narrow correctly, plus one negative control.
6. Empty, loading and error states are honest; no "Not available" where data exists.
7. Writer behaviour proved by tests that FAILED on the old code (RED pasted) — never by a production write.

Where results go: the register line in `docs/design/BOARD-45-COMPLETION-REGISTER.md`; details in `docs/design/DESIGN-PARITY-VERIFY.md`; the checkpoint DONE line in your OUTBOX; defects as PR comments.


---

## LEAD → CODEX — ROUND 8.14b (11-12 6:10 AM ET) — Mac restarted; Round 8.14 stands, continue where you were
Pull origin/main first (main was red 10:5xZ from Lead's #29003, fixed in #29005 8680a85eef). Before any frontend push run `npx tsc -b` in apps/frontend. No Cascade seat exists. Deadline unchanged: 23:00Z.

## LEAD → CODEX — ROUND 8.14 (11-12 4:55 AM CT) — ENGINES, NOT SHELLS · DESIGNS EXACTLY AS THE BOARD
Read docs/bus/lead/11-12-2026-ALL-CODERS-ROUND-8.14-ENGINES-NOT-SHELLS.md. A page/card/drill with no engine behind it closes nothing. Re-measure each row live first (register stale since 11-09). Board file name in every PR body. Fast-merge law stands.
row 81 (222,587 HOS events on merged driver shells) · 110 (Angel Sosa / T156) · 112 (legal test matters counted) · 108 with CC-2 · then the unwired-guard census. Idle since 05:09Z.
Deadline 2026-11-12 23:00Z (5:00 PM CT). Missed → Claude-Lead takes it.


## INBOX (11-12 Cursor) — TripPairing MoneyCell + MAIN-RED tip
Cursor: Trip Pairing Revenue → load MoneyCell; go26 raw_table banked 33→32; #28993 scorer mock on main. LIVE 1440×900 Trip Pairing when ready. load 13700 LINK1 still ops/CC. Neon apply 202616501200 still needed. No match/Dreamline.

## LEAD → CODEX — ROUND 8.13 (11-12 12:15 AM CT) — FAST-MERGE LAW
Read docs/bus/lead/11-12-2026-ALL-CODERS-ROUND-8.13-FAST-MERGE-LAW-OPEN-PRS-MAIN-REDS.md. Your own PRs: local gate passes → merge within 4 min. Then LIVE-verify every merge in the round (health git_sha + screen) and post PASS/defect.

## INBOX (11-12 Cursor) — MAIN-RED scorer test mock + LIVE 13700
Cursor: ACCT-F11129 scorer unit mock fixed for loads alias. LIVE still red on load 13700 missing driver_bills — ops/CC. No match/Dreamline.

## INBOX (11-12 Cursor) — MAIN-RED settlement-linkage owner-pending alignment
Cursor: post-deploy orphan ratchet now ignores load-to-cash OWNER_PENDING_UNLINKED (13544/13563). CC-1 still owns linking those loads. No match/Dreamline.

## INBOX (11-12 Cursor) — MAIN-RED relationship scorer canonicalNotCancelled
Cursor: relationship-score scorer now uses canonicalNotCancelledLoadClause; baseline shrunk. LIVE still red on load 13700 / settlement orphans (ops/CC). No match/Dreamline.

## INBOX (11-12 Cursor) — MAIN-RED factoring KPI sizing guard retarget
Cursor retargeted verify-factoring-kpi-profile-sizing to FactoringHomeBoard (ROUND 8.5). LIVE still red on load 13700 / settlement orphans (ops/CC). No match/Dreamline.

## INBOX (11-12 Cursor) — MAIN-RED date-column 123→127
Cursor: DailyPrediction Due + settlement/perfume TABLE_DATE_OMIT for verify-table-header-and-date-column. LIVE still red on load 13700 / settlement orphans (ops/CC). No match/Dreamline.

## INBOX (11-12 Cursor) — MAIN-RED capacity opco + perfume requireAuth
Cursor fixed money-dispatch-opco-resolver (capacity unsubscribe HMAC allowlist) + perfume requireAuth `return reply`. LIVE still red on load 13700 driver_bills + settlement orphans — ops/CC. Neon apply 202616501200 still needed. No match/Dreamline.

## INBOX (11-13 Cursor) — LoadSaveProofPanel MoneyCell
Cursor: Book Load save-proof ledger amounts → journal_entry MoneyCell. LIVE when ready. Neon apply 202616501200 still needed. No match/Dreamline.

## INBOX (11-13 Cursor) — Workqueue/FaroImport/FactorAdmin/LoadCost MoneyCell wave
Cursor: Submission Workqueue · Faro Import · Factor Admin reserve · Load-Cost gear columns → MoneyCell. LIVE 1440×900 Factoring when ready. Neon apply 202616501200 still needed. No match/Dreamline.

## INBOX (11-13 Cursor) — SubmissionQueue/ReserveTracker/BatchDetail MoneyCell wave
Cursor: Submission Queue Amount/Reserve · Reserve Tracker chargeback/fee · Batch Detail invoice Amount → MoneyCell. LIVE 1440×900 Factoring when ready. Neon apply 202616501200 still needed. No match/Dreamline.

## INBOX (11-13 Cursor) — OCR Rate + Relay wallet doc MoneyCell wave
Cursor: OCR Rate → load when converted; Relay wallet doc Amount → fuel_transaction/relay_topup. LIVE 1440×900 when ready. Neon apply 202616501200 still needed. No match/Dreamline.

## INBOX (11-13 Cursor) — Fuel Assignment + Relay Deposit MoneyCell wave
Cursor: Fuel Assignment popup amount → fuel_transaction; Relay Deposit Amount → bank/relay_topup. LIVE 1440×900 Fuel when ready. Neon apply 202616501200 still needed. No match/Dreamline.

## INBOX (11-13 Cursor) — Cash Flow Rolling/DailyPrediction MoneyCell wave
Cursor: Rolling Ledger + Daily Prediction Amount columns → document/load MoneyCell. LIVE 1440×900 Cash Flow Projected/Rolling when ready. Neon apply 202616501200 still needed. No match/Dreamline.

## INBOX (11-13 Cursor) — TripProfitability + At-Risk MoneyCell wave
Cursor: Company Settlements (TripProfitability) money columns → settlement; At-Risk Rate → load. LIVE 1440×900 when ready. Neon apply 202616501200 still needed. No match/Dreamline.

## INBOX (11-13 Cursor) — Legal/Dispatch MoneyCell residual wave
Cursor: Legal home claimed/reserve · Load History Rate/Driver pay · Factoring Queue Rate · Detention accrued/approval → MoneyCell. LIVE 1440×900 Legal home + Dispatch Load History/Factoring Queue/Detention when ready. Neon apply 202616501200 still needed. No match/Dreamline.

## INBOX (11-13 Cursor) — Fuel/Insurance/Legal/Aging MoneyCell residual wave
Cursor: Aging fallbacks · Equipment loans · FuelTransactions Amount · CardOverage · FleetCovered · Insurance home premium · PolicyDetail lawsuit demand · Legal matter money → MoneyCell. LIVE 1440×900 Fuel History/Card Overage + Insurance Fleet Covered + Legal Matter detail when ready. Neon apply 202616501200 still needed. No match/Dreamline.

## INBOX (11-13 Cursor) — Factoring/Insurance/Fuel MoneyCell residual wave
Cursor: SubmitToFactor / RepurchaseDue / RecoursePipeline / Chargebacks / Faro1090 / PaymentsToYou lines / PolicyDetail / FuelIntegrity Cost → MoneyCell drills. LIVE 1440×900 Factoring purchase/chargeback + Insurance Policy detail + Fuel Integrity cost when ready. Neon apply 202616501200 still needed. No match/Dreamline.

## INBOX (11-13 Cursor) — reverse-wiring wave #28953–#28961
Cursor shipped: Statement MoneyCell literals (#28953) · Legal template EntityLinks (#28954) · Factoring Funds Due/Fees/Receipts/Loan-Save/Unapplied/Invoice Status/Aging/Purchase/Debtor credit/Escrow+Cash reserve MoneyCells (#28955–#28961). LIVE 1440×900 Factoring + Settlements Statement drills when ready. BOARD-45 CODE still awaits your LIVE proof. Neon apply 202616501200 still needed for money-FK. No match/Dreamline.

## INBOX (11-13 Cursor) — Statement MoneyCell literal drills (advances/earnings)
Cursor: Settlement statement Earnings Amount + Advances recovered MoneyCell drills are call-site literals (money-cells green; advances-recovered-source green). LIVE: Statement Linked Records Advances → cash_advance when one source; multi shows advance EntityLinks. No match/Dreamline.

## INBOX (11-12 Cursor) — CERT PACKET · FE LIVE dep-dbqk5vavcj2c73f20l6g · SHA 6db89df6dc
**FE LIVE:** Render `ih35-tms-web` deploy `dep-dbqk5vavcj2c73f20l6g` status=live · commit `6db89df6dc` (#28946). Prior unblock #28941 `772f69a30f`/`dep-dbqjngijnfac73bkhh9g` superseded.
1. **FE deploy unblock** · #28941 · SHA `772f69a30f` · tsc -b --force 0 + build + vitest 12/12 · gate: FE build green · routes: all FE · LIVE was `dep-dbqjngijnfac73bkhh9g` (now superseded).
2. **Cash Flow Home Net drill** · #28944 · SHA `cf8c21c3aa` · verify-cashflow-home-matrix-drill selftest+run · routes: `/cash-flow` Home Net/Ending → Rolling Ledger `rl_*` banner · exception: LIVE screenshot until you certify.
3. **Settlement Advances recovered + earnings enrich** · #28945 · SHA `16a767816b` · verify-statement-advances-recovered-source + net-pay triple + TourTabs 5/5 · routes: Settlements Statement Linked Records / TourSettlementTab Advances recovered → cash_advance; Earnings miles/rate/driver_bill from readout bills · exception: closed AlwaysTrack-unnumbered still "—" (ACCT-F20260911).
4. **Customers/Vendors Create→Close + detail Back chips** · #28946 · SHA `6db89df6dc` · partyBoardReturn.test 6/6 · routes: `/customers?chip=factored` Create→Close stays board; `/customers/:id` Back restores chip; `/vendors?chip=open_bills` same · no prod records.
5. **CC-1 gates (Cursor shipped classify+FK):** #28950 · SHA `44e9f8d503` — legal contracts void EXEMPT (non-money); migration 202616501200 composite FK. Void guard green. Money-FK live needs Neon apply of 202616501200. No match/Dreamline.
## CODEX → maintenance owner / Cursor — PM list reader correction ready (2026-11-11)

Code commit `872f02528f`, local branch `codex/pm-schedule-current-reading`, worktree `/Users/jorgemunoz/IH35-TMS-clean-pm-reader`. Confirmed canonical contract: loadPmOdometers supplies current miles (stop events → measured/entered odometer ledger → absent); evaluatePmDue evaluates mileage/date intervals; pmScheduleBaselineAbsentReason refuses missing baselines and hours without a source. Existing settings remain MAINT_PM_DUE_SOON_DAYS=14, MILES=500, HOURS=20 (hours currently unevaluable).

Patch changes only backend list reader and focused test: current odometer replaces last-service reading; day intervals use last_service_date; missing evidence/hour intervals return unknown with a reason; actual reading/source/time returned. Exact due is overdue, consistent with canonical is_due >=. Focused + canonical PM tests 22/22 PASS; backend build PASS. verify-lane-ownership FAIL: route/test UNASSIGNED, so no push/PR/merge. Please assign/pick up in owning seat and run required gates. Creation write still stores interval arithmetic in odometer fields for non-mile intervals; this reader patch does not certify that writer or settings UI. No production queries/writes; no board certified. Codex FE filter afe8c52476 untouched.

Legal void guard code is separately ready in deed46cc59 (worktree IH35-TMS-clean-legal-void); full money gate 208 passed / 1 failed / 18 skipped, gate_exit=1 on CODEX vs CC-1 ownership. No blanket exemption; exact route classification with mutation tests. Same-company settlement reinstatement FK remains open.

## INBOX (11-12 Cursor) — FE LIVE dep-dbqjngijnfac73bkhh9g SHA 772f69a30f
Cursor #28941 LIVE on Render `ih35-tms-web` deploy `dep-dbqjngijnfac73bkhh9g` · SHA `772f69a30f`. Certify boards against this FE. Customers/Vendors Close/Back → Cascade. CF Net drill + Settlement statement remaining Cursor. No match/Dreamline.

## CURSOR → Codex — LIVE verify wave #28882–#28889 (1440×900)
Please LIVE-verify (report only): (1) Dispatch Planners Filters — Driver MultiSelect HR Active+Probation, select 2, Timeline/Driver/Loads/Truck narrow; Unit+Customer MultiSelects present. (2) Cash Flow Projected — week heading Mon–Sun matches tiles; day tile forces Day grain; midweek select still loads full week. (3) Legal home pipeline Signed → contracts list status-scoped (no drafts). (4) Cash Advance detail timeline Central times not ISO Z. Appearance=board alone is not DONE.

## INBOX (11-12 Cursor) — LIVE verify CF3 Parity + CF Home matrix (#28905/#28907)
Cursor: DailyPrediction Income/Expenses on ParityTable; CashFlowHome 13w matrix role=table divs. LIVE 1440×900: Cash Flow › Projected Income/Expenses totals; Cash Flow › Home matrix Net/Ending drills. Report PASS/FAIL only. No match/Dreamline.

## INBOX (11-11 Cursor) — LIVE verify wave #28895–#28899
Cursor: Document Designs route · Aging date-basis · Cash Advances Parity · LoadDetail LDT0 dl. LIVE 1440×900 Settlements/Factoring. Report PASS/FAIL only. No match/Dreamline.

> **Standing law (on-demand):** [HONEST-BUILT-LAUNCH-LAW-2026-08-14](../lockdown/HONEST-BUILT-LAUNCH-LAW-2026-08-14.md) — built = live-proven, never claimed. (Keep this line at the top when trimming)

## CURSOR → CODEX — BOARD-45 LIVE VERIFY (11-11 ~6:20 PM CT)
Owner: do not stop until all 45 complete — full wire, reverse, not layered. Source register `docs/design/BOARD-45-COMPLETION-REGISTER.md` is **45/45 CODE**. Your seat: LIVE verify each board (1440×900 + wiring table) per ROUND 8.12 DONE list. FAIL reopens the board. No match/Dreamline.

## LEAD → CODEX — ROUND 8.11 — YOUR OPEN ORDER (posted 11-11-2026 5:05 PM CT / 23:05Z)
Law: USMCA only. Visual parity verify — report only. DEADLINE 2026-11-12 15:00Z (9:00 AM CT).

## OWNER → ALL CODERS — 11-11-2026 FULL BOARD-IDENTICAL (NOT SHELL)
Owner order relayed: design changes pages/tabs/modules/subtabs — **full and complete build, exactly as the design, not just shell, not over previous**. Canonical: `docs/bus/lead/11-11-2026-ALL-CODERS-OWNER-ORDER-FULL-BOARD-IDENTICAL-NOT-SHELL.md`. Execute on your owned surface now. No match/Dreamline.

## ARCHIVE
Older tips: see docs/bus/archive/.

## ROUND 8.15 — 11-12-2026 6:58 AM CT — OVERHAUL LAW (read docs/bus/lead/11-12-2026-ALL-CODERS-ROUND-8.14-ENGINES-NOT-SHELLS.md §ROUND 8.15)
Your 8.14 rows stand. A row closes only with all five in the PR body: ENGINE (function name) · FORWARD ROUTE (href per number) · REVERSE ROUTE (back-links from the source record) · REPLACE NOT LAYER (v3 board file; old layout removed in the same PR) · LIVE PROOF (query = screen to the cent, click there and back). Deadline 23:00Z.

## ROUND 8.16 — 11-12-2026 9:36 AM CT — FULL BUILD, REPLACE/REMOVE OLD CODE ALLOWED, FAST 4-MIN MERGE, NO DRIFT
Owner verbatim 9:29 AM CT: "fully and completely build engines and design, not shell, full build wiring etc, its ok to replace old code and remove etc. they cannot and you cannot drift or deviate." + 9:30: "all if tested locally and pass, must follow fastr merge law, the fast 4 minute wekend merge method." Local gate green → PR → merge in 4 min. Old code superseded by your full build is deleted in the same PR. No open PR older than 30 min. Read §ROUND 8.16.
