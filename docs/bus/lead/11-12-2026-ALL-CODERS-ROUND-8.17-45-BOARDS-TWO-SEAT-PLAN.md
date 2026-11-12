# ROUND 8.17 — 45 BOARDS, TWO SEATS, ONE PLAN — CODEX + CURSOR
Issued 11-12-2026 10:20 AM CT (16:20Z) by Claude-Lead on the owner's order:
"i need it to get this done with cursor, urgently and today, it has been 3 weeks and we cannot complete … they must follow the plan both."

## 0. Measured start state (from Codex's own audit, repo tip 40138f8658)
- Boards certified: **0 of 45**. FAIL 27 · UNVERIFIED 13 · PARTIAL 4 · FAIL/deploy-unverified 1.
- Why 3 weeks were lost: ONE board at a time (Fuel first), Codex finds → Cursor repairs → Codex rechecks → next board. 45 boards × that loop never finishes.
- The full per-board defect list is `docs/design/BOARD-45-STATUS-2026-11-12.md` (Codex's table, committed to main so both seats work from the same list).

## 1. THE CHANGE — work by DEFECT CLASS, both seats building at once
Most FAILs are the same four defects repeated across boards. Fix each class ONCE, at the source, and it closes on every board together.

| Class | Defect | Boards it closes | Owner seat |
|---|---|---|---|
| R | Back/return loses the originating board, tab, filter, period or cohort | 2 5 7 12 18 20 24 25 28 29 30 33 34 43 22(PM) | CURSOR |
| L | Legacy UI still layered under/behind the v3 board (duplicate panels, legacy master/detail behind drawers, duplicate sections) | 9 10 11 18 32 | CURSOR |
| S | A number that does not open its source (KPI, MoneyCell, count) or opens the wrong record | 3 6 10 18 19 28 29 31 33 34 35 42 | CURSOR |
| N | The number itself is wrong — the reader/engine behind the board | 3 4 8 18 19 22 26 31 32 34 35 24(date) | CODEX |
| V | Never verified at all | 13 14 15 16 17 36 37 38 39 40 41 42 | CODEX verifies, CURSOR repairs what fails |

## 2. RULES BOTH SEATS FOLLOW
1. **Build, never shell.** Every fix ends at the real engine number on the live screen. Replace and delete the old code; never layer (ROUND 8.15/8.16).
2. **Nobody certifies their own work.** Cursor merges → Codex re-checks that board LIVE on the deployed SHA. Codex merges → Cursor re-checks.
3. **Fast 4-minute merge law (8.6/8.16).** Local gate green → merge. A red that is also on main, or the shared-DB deadlock flake, does not block. No PR open longer than 30 minutes.
4. **Read-only proof only.** No saves, matches, voids, imports, payments or bookings in USMCA to prove a board. Writers are proved by tests, never by production writes. No test/sample rows in USMCA.
5. **One register.** `docs/design/BOARD-45-COMPLETION-REGISTER.md` gets one line per board: `# · board · CERTIFIED | FAIL <defect> · deployed SHA · checked-by · Z time`. CERTIFIED only when the OTHER seat checked it live on the deployed SHA.
6. **Lane ruling.** This box is the Lead's lane ruling for every file these fixes touch. PR body cites `ROUND 8.17` and the 5 lines of §8.15 (ENGINE, FORWARD ROUTE, REVERSE ROUTE, REPLACE NOT LAYER, LIVE PROOF).
7. **Stop-the-line only for a real refusal.** If something blocks, fix the blocker in the same session. Report a blocker only with the exact error pasted.

## 3. CHECKPOINTS (each seat appends a measured line to its OUTBOX)
- 18:00Z (12:00 PM CT) — class R helper merged; boards certified count.
- 20:00Z (2:00 PM CT) — classes L + S merged on 10+ boards; Codex N fixes for 19, 26, 4 merged.
- 22:00Z (4:00 PM CT) — all V boards checked; every FAIL has an open fix.
- **04:00Z 11-13 (10:00 PM CT) — deadline.** Register shows 45 lines. Anything not CERTIFIED carries its measured remaining defect and the PR fixing it. A missed checkpoint → Claude-Lead takes the board and records the miss.

---

## CURSOR BOX

# CURSOR — ROUND 8.17 — 45 BOARDS: YOU BUILD CLASSES R + L + S · deadline 2026-11-13 04:00Z (10:00 PM CT)
From Claude-Lead, 11-12-2026 10:20 AM CT (16:20Z). Owner, verbatim: "i need it to get this done with cursor, urgently and today, it has been 3 weeks and we cannot complete … they must follow the plan both."

READ FIRST (both files on main): `docs/bus/lead/11-12-2026-ALL-CODERS-ROUND-8.17-45-BOARDS-TWO-SEAT-PLAN.md` and `docs/design/BOARD-45-STATUS-2026-11-12.md` (Codex's 45-board defect table).

STOP doing one board at a time. You fix each defect CLASS once, at the source, on every board it appears on. Codex fixes the wrong NUMBERS (class N) in parallel and re-checks your boards live. You re-check Codex's.

## R — RETURN CONTEXT (one helper, every board) — merged by 18:00Z
Today Back drops the origin on: 2 Unexpected→Banking txn, 5 Projected week/date, 7 Rolling Ledger invoice→Back, 12 Truck Planner tab/filters + unit Back, 18 Factoring fee detail Back→Home, 20 Insurance policy Back, 24 Safety drill cohort, 25 Reports→Trial Balance cash basis, 28/29 settlement reports local-only filter/group, 30 customer statement Back (two-customer filter + period), 33 Open→Home, 34 Closed cohort, 22/43 PM Back resets fleet-health cohort.
- Build ONE shared return-context mechanism (origin route + tab + filters + period + cohort carried in the URL, restored on Back). Every board's filter/group/period state lives in the URL, not local state.
- Replace every hand-rolled Back on those boards with it. Delete the old per-page code.
- Test: one forward→Back test per board above asserting the restored URL state.
- Board 2: Banking must open the target transaction drawer from `txn_id` in the view Banking actually renders.
- Board 12: Cancel discards un-applied selections; Apply enabled when selections change.
- PM leaf-back guard retarget (#29033 request) ships in this PR; CC-1 reviews within 30 min.

## L — REMOVE LAYERED LEGACY UI — merged by 20:00Z
- 9 Customers + 10 Vendors: Create still mounts the legacy master/detail behind the canonical drawer → remove the legacy layout, keep the workflows.
- 11 Driver Profile: one Legal Matters section, one audit reader, one Stops+miles grid; period-end dates formatted.
- 18 Factoring: legacy summary/fees/beginning-ending panels below the approved summary → removed.
- 32 Settlements Home: the Closed panel labels rows "Open" → label follows the record's real state.
- 19 Fuel: approved header/subtitle, make/model identity, SEVEN columns, panel proportions; extra workflows relocated deliberately, not stacked.

## S — EVERY NUMBER OPENS ITS SOURCE — merged by 20:00Z
- 3 Banking Money In drill keeps the KPI population (dates, types, direction).
- 6 Actual vs Projected: View all + variance chips; KPI and amounts drill.
- 10 Vendors: Pays-through counts + AP-aging values open their lists.
- 18 Factoring: purchase chart shows ALL periods (no silent last-16), has a value axis and a source drill.
- 19 Fuel: amounts open the fuel transaction/receipt (use the expense→Fuel purchase `transaction_id` contract), NOT a truck; no-load KPI opens no-load fills only; View all keeps the month; issuer name, never a raw UUID; card counts drill.
- 28/29/33/34/35/42: every KPI and money value opens its source list/record.
- Fix the Fuel null-load popup test (missing CompanyProvider) keeping its assertions.

## V — when Codex files a FAIL on boards 13–17 or 36–42, you repair it the same session.

## RE-CHECK CODEX
Within 30 minutes of each Codex merge going live, re-check that board read-only on the deployed SHA and write the register line.

## PROOF (every PR)
PR body: `ROUND 8.17` + ENGINE / FORWARD ROUTE / REVERSE ROUTE / REPLACE NOT LAYER / LIVE PROOF. Local gate green → merge (fast 4-minute law). No PR open > 30 min. Read-only live proof only — no production writes.
Register: `docs/design/BOARD-45-COMPLETION-REGISTER.md` one line per board (# · board · CERTIFIED|FAIL <defect> · deployed SHA · checked-by · Z time). A board you fixed is CERTIFIED only after Codex checks it.

## DONE LINE (OUTBOX-CURSOR.md, at each checkpoint 18:00Z / 20:00Z / 22:00Z / 04:00Z)
`ROUND 8.17 <Z> · classes R/L/S merged: <PR#s + SHAs> · boards CERTIFIED by Codex: <n>/45 <list> · FAIL left: <board: defect> · deployed FE/BE SHA <sha>`
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

## CODEX BOX

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
