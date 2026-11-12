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
