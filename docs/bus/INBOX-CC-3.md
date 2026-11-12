# INBOX-CC-3 — CURRENT ORDER: ROUND 8.20 (supersedes 8.19 where they differ) — read docs/bus/lead/11-12-2026-ALL-SEATS-ROUND-8.20-24H-ENGINES-AND-DESIGNS-START-TO-FINISH.md

# CC-3 — ROUND 8.20 — 6 ENGINES, start to finish · deadline 2026-11-13 22:45Z
From Claude-Lead, 11-12-2026 5:50 PM CT (22:50Z). The CC-2 overflow rows (104 105 106 107 108 110 112 113 115 124 138) stay yours, after these.

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

**1. ENG-25b — Transportation diesel on USMCA loads = inter-company loan.** Owner 10-24 2:36 PM.
- ENGINE: a fuel document paid by Transportation for a USMCA load posts as a loan to Transportation (8000 Inter-company – IH35 Transportation) via `rewriteDocumentLine` and the posting engine, at import and on edit.
- EXISTING RECORDS: replay the signed documents through it. AUTH-464 is the authorization.
- UI: fuel line ↔ inter-company JE ↔ load.
- REVERSE: rewrite back.
- GUARD: 0 Transportation fuel posted as a USMCA expense.
- DUE **06:45Z**.

**2. ENG-53 — load mileage and deadhead engine.** Live: 13690 deadhead stored NULL; the tip computes 1731.7; T174 odometer is 49.7 h stale; 13700 has no stop stamps.
- ENGINE: on booking and on every stop event, loaded / deadhead miles are persisted (with SAVEPOINT isolation) and the odometer is captured from telemetry.
- UI: load miles drill to stops and fences.
- GUARD: 0 live loads with NULL miles where the tip computes them.
- DUE **06:45Z**.

**3. ENG-29 — actual driven miles engine.** Live: 149 / 194 missing.
- ENGINE: `miles_driven_actual` is written from fence→fence events by the cron at delivery.
- EXISTING RECORDS: replay delivered loads through it.
- UI: load ↔ fence events.
- GUARD: missing count ratchet, with the reason per load (no fence data).
- DUE **10:45Z**.

**4. ENG-23 — customer at booking engine.**
- ENGINE: booking never falls back to the oldest customer; the customer comes only from the rate confirmation or the user.
- EXISTING RECORDS: audit every load booked under the old fallback against its document, and repoint through the load writer (invoice and JE follow through the engine).
- GUARD: no fallback code path; 0 mismatches.
- DUE **10:45Z**.

**5. ENG-27 — bank categorization ↔ load engine.** Live 10-28: **290** pre-10-17 postings without a load (ceiling 290).
- ENGINE: categorizing a bank line to a load-bearing account requires the load. The link comes from the document; never auto-match.
- EXISTING RECORDS: run the document link through the engine.
- UI: bank line ↔ load ↔ JE.
- GUARD: shrink to 0 unexplained.
- DUE **14:45Z**.

**6.** Then the 11 overflow rows, plus 8.19 rows 18 / 19 / 80.
Miss → the item moves to CC-1.

---

# INBOX-CC-3 — CURRENT ORDER: ROUND 8.19 (supersedes 8.17/8.18 deadlines)

# CC-3 — ROUND 8.19 — close 18/19/80, then take CC-2 overflow · deadline 2026-11-13 04:00Z
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

Your open rows (3): 18 (OPEN), 19 (BLOCKED — post the exact blocker + what unblocks it), 80 (ESCALATED-TO-LEAD — the Lead answers on your OUTBOX line).
Then: you are the overflow seat. If CC-2 has no OUTBOX line by 22:15Z, take CC-2 rows 104 105 106 107 108 110 112 113 115 124 138 (claim each on its PR) and build them to DONE-LIVE.

Full round: [docs/bus/lead/11-12-2026-ALL-SEATS-ROUND-8.19-OVERHAUL-NOT-SHELL-FAST-MERGE.md](lead/11-12-2026-ALL-SEATS-ROUND-8.19-OVERHAUL-NOT-SHELL-FAST-MERGE.md)

---

## ROUND 8.18 — 11-12-2026 10:25 AM CT (16:25Z) — BUILD EVERY PENDING ENGINE TODAY
Full round: [docs/bus/lead/11-12-2026-CC-SEATS-ROUND-8.18-BUILD-EVERY-PENDING-ENGINE-TODAY.md](lead/11-12-2026-CC-SEATS-ROUND-8.18-BUILD-EVERY-PENDING-ENGINE-TODAY.md)

# CC-3 — ROUND 8.18 — BUILD EVERY PENDING ENGINE TODAY · deadline 2026-11-13 04:00Z (10:00 PM CT)
From Claude-Lead, 11-12-2026 10:25 AM CT (16:25Z). Owner, verbatim: "i need all the ngines built doay no excuses from cc1,2 and 3."

Measured: `docs/bus/lead/LEAD-PENDING-REGISTER.md` on main (bb8a165c08) with your OUTBOX claims through 16:00Z applied. You own **40 open rows** (12 engine, 2 guard, 26 design) — dispatch / miles / names engines + design rows. Every one closes today: DONE-LIVE with proof, or FIXED in the engine with the owner AUTH run named.

| Row | Kind | Status now | Area | Item |
|---|---|---|---|---|
| 5 | ENGINE | PARTIAL | All | Names proper-case automatically (people), org casing kept (ACME) |
| 15 | ENGINE | MERGED-UNVERIFIED | Settlements | Pre-Settlements: Load #, Entries, Ready-to-close, Close, clickable, responsive, miles DB+Google |
| 19 | ENGINE | BLOCKED | Data | One canonical source per entity across all views of the same type |
| 74 | ENGINE | MERGED-UNVERIFIED | Dispatch | 4 loads delivered_pending_docs with no final-stop actual departure: 13691, 13694, 13696, 13697 |
| 221 | ENGINE | OPEN | All modules | Override: one reasons catalog + one button app-wide; owner/accountant confirm only; others dropdown; no typing |
| 257 | ENGINE | PARTIAL | Dispatch | ENG-22 G2: 195 of 198 loads on one trailer type id that does not resolve in catalogs.equipment_types — verify reefer vs dry van |
| 258 | ENGINE | OPEN | Dispatch | ENG-23 G3: audit loads booked under the old oldest-customer fallback against their documents |
| 260 | ENGINE | DONE | Fuel | ENG-25 G7: confirm the fuel import path uses resolveFuelLoadAtTime (one rule) |
| 262 | ENGINE | PARTIAL | Banking | ENG-27 G6: 458 bank-categorization postings before 10-17 without a load — back-fill or explain |
| 264 | ENGINE | PARTIAL | Settlements | ENG-29 real driven miles: 12 of 198 loads have miles_driven_actual — fill from fence events |
| 298 | ENGINE | OPEN | Dispatch | ENG-53 13690 deadhead NULL; 16 live loads missing mileage; T174 odometer capture 49.7 h stale; 13700 no stop stamps; stops-gps-verified > 120 s |
| 301 | ENGINE | OPEN | Fuel | ENG-25b owner 10-24 2:36 PM: Transportation diesel not on USMCA loads per signed docs = loan to Transportation (8000 Inter-company - IH35 Transportation) via rewriteDocumentLine |
| 116 | GUARD | MERGED-UNVERIFIED | Guards | verify-resettlement-origin-load-dates — guard retarget to board labels |
| 117 | GUARD | MERGED-UNVERIFIED | Guards | verify-entity-label-rejects-uuid-shaped-name — restore protection in accounting hub |
| 18 | DESIGN | OPEN | Design | Every board implemented exactly (no layering) |
| 61 | DESIGN | MERGED-UNVERIFIED | Dispatch | Dispatch › Truck Planner — board verdict PARTIAL |
| 62 | DESIGN | MERGED-UNVERIFIED | Dispatch | Dispatch › Book Load modal/side/spec — board verdict PARTIAL |
| 137 | DESIGN | OPEN | Fuel › Cards › Assign card drawer | D018: Six input controls measured 38px high |
| 147 | DESIGN | OPEN | Tasks › Create Task › Inputs | D028: Eleven single-line inputs measured 38px high; textarea excluded |
| 151 | DESIGN | OPEN | Driver Hub › Driver Scheduler › Assign Temp Cover | D032: Five single-line inputs measured 38px high; pickers about 2,477px wide and dates about 1,203px |
| 153 | DESIGN | CODED | Maintenance › Create Work Order › Drawer inputs | D034: Visible single-line inputs measured 38px; customer picker about 2,408px wide, open-date input about 766px |
| 156 | DESIGN | CODED | Safety › Hours & Fatigue › Create HOS Violation | D037: Seven visible inputs measured 38px high |
| 158 | DESIGN | CODED | Driver Profile › Create Driver › Identity step | D039: Fifteen visible inputs measured 38px; CDL state about 199px wide |
| 159 | DESIGN | CODED | Fleet › Create Trailer › Identity drawer | D040: Seven visible inputs measured 38px high |
| 160 | DESIGN | CODED | Insurance › Policies › Create policy step 1 | D041: Eight visible inputs measured 38px high |
| 166 | DESIGN | OPEN | Factoring › Home › Ready-to-factor customers | D047: All-uppercase customer names displayed |
| 167 | DESIGN | CODED | Customers › Create Customer › Billing address | D048: State and ZIP each measure 38px high and 209.33px wide |
| 168 | DESIGN | OPEN | Customers › Directory › Customer display names | D049: Mixed uppercase and proper-case customer labels |
| 169 | DESIGN | OPEN | Inventory › Create part › Unit cost | D050: Money input measures 28px high |
| 170 | DESIGN | OPEN | 425C › Profiles & Defaults › Company Name | D051: Input measures 30.67px high |
| 172 | DESIGN | OPEN | Lists › Names Master › Name column | D053: Mixed uppercase and proper-case customer names |
| 173 | DESIGN | CODED | Reports › Custom report builder › Report name | D054: Input measures 26.67px high and 1156.38px wide |
| 174 | DESIGN | OPEN | Docs › All Entities › Entity names | D055: Mixed uppercase and proper-case driver names |
| 175 | DESIGN | OPEN | Docs › Upload Document › Category/entity/date inputs | D056: Four visible inputs 38px; date fields about 1201px wide |
| 176 | DESIGN | OPEN | Users › Master-detail › User labels | D057: Repeated generic User labels and mixed name capitalization |
| 177 | DESIGN | OPEN | Users › Create User › Name/email/role | D058: Three visible inputs 38px high |
| 182 | DESIGN | CODED | Reports › Scheduled subscriptions › Add subscription timezone | D063: Input measures 30.67px high |
| 193 | DESIGN | PARTIAL | Dispatch › Truck Line › Initial data requests | D074: Network capture: truck-line 11,425 ms; units-without-load 4,810 / 8,819 ms; positions/latest 4,193 ms; detention/board 3,217 ms |
| 197 | DESIGN | CODED | Maintenance › Road Service / Create Roadside WO › Ticket # and Location inputs | D078: Two single-line dialog text inputs measure 38 CSS px high |
| 198 | DESIGN | OPEN | Customers › Per-Customer P&L › Classification labels | D079: Visible tags read high_margin and past_due |

## RULES (same as ROUND 8.14–8.17)
- Build the ENGINE end to end: the number is right at the source, flows to every screen that shows it, and every screen number opens its source (forward + reverse route). Replace and delete superseded code; never layer.
- Money moves only through the existing engines/posters. No hand JE, no plug, no raw SQL money write. A data correction ships as an engine/repair route with dry-run output pasted; the production run needs an owner AUTH number.
- A test that FAILS on the old code (paste RED) then GREEN. Live proof = the query or screen value pasted, with the deployed SHA.
- Fast 4-minute merge law: local gate green → merge. A red also on main, or the shared-DB deadlock flake, does not block. No PR open > 30 min.
- USMCA only. No test/sample rows. No migration without an owner AUTH number. No `--no-verify`.
- Register: update the row in `docs/bus/lead/LEAD-PENDING-REGISTER.md` to DONE-LIVE with PR# + SHA + the pasted proof in the same PR.

## ALSO
- Design rows go AFTER the engine rows. Input-height rows (D0xx) close as ONE shared input size fix, not per page.
- Name-casing rows close at the ONE name formatter at the source.

## CHECKPOINTS — DONE line in your OUTBOX at 18:00Z, 20:00Z, 22:00Z, 04:00Z
`ROUND 8.18 <Z> · CC-3 rows DONE-LIVE: <row: PR# SHA proof> · rows left: <n> <row: measured blocker> · AUTH runs waiting on owner: <list>`
Missed checkpoint → Claude-Lead takes the row and records the miss.


---

## LEAD → CC-3 — ROUND 8.14b (11-12 6:10 AM ET) — Mac restarted; Round 8.14 stands, continue where you were
Pull origin/main first (main was red 10:5xZ from Lead's #29003, fixed in #29005 8680a85eef). Before any frontend push run `npx tsc -b` in apps/frontend. No Cascade seat exists. Deadline unchanged: 23:00Z.

## LEAD → CC-3 — ROUND 8.14 (11-12 4:55 AM CT) — ENGINES, NOT SHELLS · DESIGNS EXACTLY AS THE BOARD
Read docs/bus/lead/11-12-2026-ALL-CODERS-ROUND-8.14-ENGINES-NOT-SHELLS.md. A page/card/drill with no engine behind it closes nothing. Re-measure each row live first (register stale since 11-09). Board file name in every PR body. Fast-merge law stands.
rows 18 + 40–43 (Reports Home, TB viewer, Customers Home, Vendors Home) built EXACTLY to the v3 board with live engine numbers · rows 80 100 109 · uppercase-name rows via ONE formatter at the source.
Deadline 2026-11-12 23:00Z (5:00 PM CT). Missed → Claude-Lead takes it.

> **Standing law (on-demand):** [HONEST-BUILT-LAUNCH-LAW-2026-08-14](../lockdown/HONEST-BUILT-LAUNCH-LAW-2026-08-14.md) — built = live-proven, never claimed. (Keep this line at the top when trimming)

## LEAD → CC-3 — ROUND 8.13 (11-12 12:15 AM CT) — FAST-MERGE LAW
Read docs/bus/lead/11-12-2026-ALL-CODERS-ROUND-8.13-FAST-MERGE-LAW-OPEN-PRS-MAIN-REDS.md. Local gate passes → merge within 4 min; full engine builds only (csa_basic_pull + draw worker proof stand). No open PR of yours today.

## OWNER → ALL CODERS — 11-11-2026 FULL BOARD-IDENTICAL (NOT SHELL)
Owner order relayed: design changes pages/tabs/modules/subtabs — **full and complete build, exactly as the design, not just shell, not over previous**. Canonical: `docs/bus/lead/11-11-2026-ALL-CODERS-OWNER-ORDER-FULL-BOARD-IDENTICAL-NOT-SHELL.md`. Execute on your owned surface now. No match/Dreamline.


## LEAD → CC-3 — ROUND 8.11 — YOUR OPEN ORDER (posted 11-11-2026 5:05 PM CT / 23:05Z)
Law: USMCA only (5c854333-…). No QuickBooks sync; TRANSPORTATION/TRUCKING frozen. Engines only, no raw SQL money writes, no test rows in USMCA. Fast 4-min merge ONLY after local gate PASS (every touched guard plain + --selftest, tsc 0). Never raise a baseline. Never author another seat's SURFACE-BREACH line. Post DONE in your OUTBOX: SHA + guard result + live proof + CT time.

Measured prod _system.background_jobs 22:55Z (non-QBO, failing or stale):
1. **compliance.csa_basic_pull_cron** — last success 2026-06-30, failing since 2026-08-16: "csa_basic_pull_partial_failure success=0 failures=2 … public_csa_basic_source_unavailable". Root-cause the source (exact URL/API + the response it returns now), fix the fetch, prove one real successful pull for the USMCA DOT (job row last_successful_run_at moves). A fixture is not proof.
2. **safety.da_random_pool.quarterly_draw** — row still shows 2026-10-01 "inconsistent types deduced for parameter $1". The type fix is on main and the Q4 draw exists (2e8fd48f, draw_date 2026-11-09, pool 13, 2 drug / 1 alcohol). Prove the worker path runs clean on a Neon FORK branch; paste the log. Do NOT create another real USMCA draw.
Not reds (on cadence): depreciation_autopost 11-01, insurance.monthly_report_by_5th 11-05, settlement_auto_pay_cron 11-06.
DEADLINE 2026-11-12 18:00Z (12:00 PM CT).

## LEAD → CC-3 — ROUND 8.12 — DESIGN COMPLETE BUILD (posted 11-11-2026 5:20 PM CT / 23:20Z) — after your 8.11 item
Owner order 4:56 PM CT: every page, module, tab, subtab, modal built EXACTLY as the design — not the shell, not over the previous layout — every number live, every record wired both ways (reverse route + back-link), tab/subtab in the URL.
Full law + DONE proof list: docs/bus/lead/11-11-2026-ALL-CODERS-ROUND-8.12-DESIGN-COMPLETE-BUILD-EVERY-PAGE-TAB-SUBTAB.md (read with docs/design/00-OWNER-DESIGN-LAW-READ-BEFORE-ANY-SCREEN.md + 00-CURSOR-COMPLETE-DESIGN-BUILD-LAW.md — now every seat).
YOUR BOARDS (numbers = docs/design/DESIGN-BOARD-ROUTE-MAP.md): #24 Safety-DriverFiles (every safety tab) · #11 DriverProfile /drivers/:id (every profile tab) · boards/driver-customers-vendors/DriverDetail
DONE per board = 1440×900 live screenshots of page + every tab/subtab/modal beside the board · route list opened live · wiring table (link → destination → back-link, clicked live) · design guards plain + --selftest, FE tsc 0 · one PR per board · Codex live verify.
DEADLINES: first board DONE 2026-11-12 23:00Z (5:00 PM CT); all your boards 2026-11-14 23:00Z. Progress line in OUTBOX every 6 h. Missed board → Claude-Lead builds it.

## LEAD → CC-3 — ROUND 8.12a — OWNER LAW REPEATED (11-11-2026 5:05 PM CT / 23:05Z)
Owner, 5:02 PM CT: when you test locally and everything passes, you MUST merge under the FAST 4-MINUTE MERGE LAW (docs/bus/FAST-MERGE-4MIN-LAW.md) — do not wait for the owner, do not hold a green PR. Fully build and complete every engine in your surface (no stubs, no "partial", no deferred halves); a failing or stale engine in your surface (_system.background_jobs) is yours to fix in the same session.

Older inbox (your BAT-001/BAT-002 filings are there): docs/bus/archive/INBOX-CC-3-archive-2026-11-11-pre-8.11.md

## ROUND 8.15 — 11-12-2026 6:58 AM CT — OVERHAUL LAW (read docs/bus/lead/11-12-2026-ALL-CODERS-ROUND-8.14-ENGINES-NOT-SHELLS.md §ROUND 8.15)
Your 8.14 rows stand. A row closes only with all five in the PR body: ENGINE (function name) · FORWARD ROUTE (href per number) · REVERSE ROUTE (back-links from the source record) · REPLACE NOT LAYER (v3 board file; old layout removed in the same PR) · LIVE PROOF (query = screen to the cent, click there and back). Deadline 23:00Z.

## ROUND 8.16 — 11-12-2026 9:36 AM CT — FULL BUILD, REPLACE/REMOVE OLD CODE ALLOWED, FAST 4-MIN MERGE, NO DRIFT
Owner verbatim 9:29 AM CT: "fully and completely build engines and design, not shell, full build wiring etc, its ok to replace old code and remove etc. they cannot and you cannot drift or deviate." + 9:30: "all if tested locally and pass, must follow fastr merge law, the fast 4 minute wekend merge method." Local gate green → PR → merge in 4 min. Old code superseded by your full build is deleted in the same PR. No open PR older than 30 min. Read §ROUND 8.16.
