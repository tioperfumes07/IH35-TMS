# INBOX-CC-2 — CURRENT ORDER: ROUND 8.20 (supersedes 8.19 where they differ) — read docs/bus/lead/11-12-2026-ALL-SEATS-ROUND-8.20-24H-ENGINES-AND-DESIGNS-START-TO-FINISH.md

# CC-2 — ROUND 8.20 — 5 ENGINES, start to finish · deadline 2026-11-13 22:45Z
From Claude-Lead, 11-12-2026 5:50 PM CT (22:50Z). Rows 104–138 already moved to CC-3 (22:16Z). **Post an OUTBOX line at EVERY checkpoint, or the item moves.**

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

**1. ENG-50 — invoice paid-amount engine.** Live 11-09: invoice-amount-paid **174 > 102** ceiling; book-equals-Faro **12 issues** (13544, 6 load mismatches, 4 self-carry missing).
- ENGINE: `amount_paid` is never stored by hand. It is computed from applications (payments + Faro purchases) by one writer on every application or void (9-13515 $525, 7 $350).
- The Faro purchase links its load at import.
- EXISTING RECORDS: replay every USMCA invoice.
- UI: invoice ↔ applications ↔ bank line ↔ Faro purchase, both ways.
- REVERSE: void application → amount_paid recomputed.
- GUARD: invoice-amount-paid at 0; book-equals-Faro at 0.
- DUE **06:45Z**.

**2. ENG-17 — card/factoring payable residual engine.** Measured: 1090 **$170,210.48**, 2510 **$187,894.21**. Codex batch 1: 17/17 posted Faro documents tie, 14 unmatched.
- ENGINE: every 1090 / 2510 posting carries its source document, and the balance is the sum of open documents (one reader).
- UI: the account register lists each open document with a drill.
- EXISTING RECORDS: every posting is tied to its document by the engine. A posting with no document is listed with its amount.
- No balancing plug JE, ever.
- GUARD: residual = sum of open documents.
- DUE **10:45Z**.

**3. ENG-13 — trailer choice engine.** Measured 10-28: null = 1 (13595); settlement 5816 trailer 445 is missing from the fleet.
- ENGINE: booking requires a trailer (unit or type), and delivery cannot close without one.
- The trailer comes from documents through the same engine.
- Trailer 445 is created as fleet equipment through the equipment writer, with its document.
- UI: load ↔ trailer ↔ unit.
- GUARD: 0 live loads without a trailer.
- DUE **10:45Z**.

**4. ENG-48 — fuel fill → expense one-to-one engine.** Owner 11-02: build first, match later. Do NOT mass-apply.
- ENGINE: each fuel fill creates exactly one expense and one JE (13563-1 JE 0¢ is refused). Same-day duplicate fills are detected and held.
- No literal account '5000' in statement-card-credit-repair: resolve by role.
- UI: fill ↔ expense ↔ JE ↔ load ↔ unit.
- REVERSE: void the fill → void the expense and JE.
- GUARD: one-to-one ratchet.
- DUE **14:45Z**.

**5. ENG-49 — settlement line totals engine.** Live: 5787 → P-0018 closed; lines are layover 75 + reimbursement 22 + admin 10 (+ escrow 25). The claim of $235.01 vs $140.20 is not a live line total.
- ENGINE: the statement's non-diesel total = sum of its lines, computed by one reader. The document-side figure is shown next to it.
- UI: statement line ↔ expense ↔ document.
- GUARD: statement totals = line sums for every closed settlement.
- DUE **14:45Z**.

Miss → the item moves to CC-1.

---

# INBOX-CC-2 — CURRENT ORDER: ROUND 8.19 (supersedes 8.17/8.18 deadlines)

# CC-2 — ROUND 8.19 — 37 rows open, OUTBOX silent since 11-02 · deadline 2026-11-13 04:00Z
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

Your open rows (37): 6 21 22 76 77 78 81 97 99 104 105 106 107 108 110 112 113 115 124 138 207 210 223 255 295 (OPEN) · 16 27 84 111 201 202 204 205 (CODED) · 12 120 (MERGED-UNVERIFIED) · 83 251 (PARTIAL).
1. **First action within 30 min (by 22:15Z): write one OUTBOX line** — which row you are on now. Silent = the row set moves.
2. CODED/MERGED rows → deploy-prove or reopen (by 23:00Z).
3. Then the OPEN rows, banking match engine first (yours).
Miss 22:15Z → rows 104–138 move to CC-3; miss 04:00Z → the rest move to CC-1/CC-3.

Full round: [docs/bus/lead/11-12-2026-ALL-SEATS-ROUND-8.19-OVERHAUL-NOT-SHELL-FAST-MERGE.md](lead/11-12-2026-ALL-SEATS-ROUND-8.19-OVERHAUL-NOT-SHELL-FAST-MERGE.md)

---

## ROUND 8.18 — 11-12-2026 10:25 AM CT (16:25Z) — BUILD EVERY PENDING ENGINE TODAY
Full round: [docs/bus/lead/11-12-2026-CC-SEATS-ROUND-8.18-BUILD-EVERY-PENDING-ENGINE-TODAY.md](lead/11-12-2026-CC-SEATS-ROUND-8.18-BUILD-EVERY-PENDING-ENGINE-TODAY.md)

# CC-2 — ROUND 8.18 — BUILD EVERY PENDING ENGINE TODAY · deadline 2026-11-13 04:00Z (10:00 PM CT)
From Claude-Lead, 11-12-2026 10:25 AM CT (16:25Z). Owner, verbatim: "i need all the ngines built doay no excuses from cc1,2 and 3."

Measured: `docs/bus/lead/LEAD-PENDING-REGISTER.md` on main (bb8a165c08) with your OUTBOX claims through 16:00Z applied. You own **33 open rows** (27 engine, 3 guard, 3 design) — banking / A-R / fuel / factoring engines. Every one closes today: DONE-LIVE with proof, or FIXED in the engine with the owner AUTH run named.

| Row | Kind | Status now | Area | Item |
|---|---|---|---|---|
| 6 | ENGINE | OPEN | Driver/Fleet | Driver photo from uploaded IDs; unit photos |
| 12 | ENGINE | MERGED-UNVERIFIED | Fuel | Fuel Questions Review crash (load_number undefined) |
| 16 | ENGINE | CODED | Settlements | A miles change at settlement re-prices the bills everywhere |
| 21 | ENGINE | OPEN | Accounting | QuickBooks unapplied credit: paid bill/invoice reduced below paid -> unapplied credit on payee |
| 22 | ENGINE | OPEN | Banking | Relay: nothing stored under TRANSP; 10/09 fundings on TRANSP bank; deposit ingest stopped after 10-09; bank feed last 10-21 |
| 27 | ENGINE | CODED | Data | Delete USMCA test records (18 legal matters, 5 policies, 7 claims, 1 accident…) |
| 76 | ENGINE | OPEN | Settlements | 0 of 85 closed settlements marked paid ($127,897.75) |
| 77 | ENGINE | OPEN | A/R | 0 customer payments / Faro purchases applied: all $621,076.72 open incl. 57 advanced invoices |
| 78 | ENGINE | OPEN | Banking | 1090 Undeposited $170,210.48 (33 Faro advances never deposited) -> GL bank -$88,433.89 |
| 81 | ENGINE | OPEN | HOS | 222,587 duty events on merged driver shells |
| 83 | ENGINE | PARTIAL | Accounting | R2: 241 Dreamline statement discount JEs ($10,744.65) -> card-credit documents |
| 97 | ENGINE | OPEN | Banking | Reconciliation drift: BofA bank $1,808.13 vs book -$88,433.89 (diff $90,242.02); Relay Fuel Wallet listed twice |
| 99 | ENGINE | OPEN | Unexpected | Possible duplicates 0 while bank lines repeat (460.01 on 10-03 and 10-05; 155.86 twice on 10-07) |
| 104 | ENGINE | OPEN | Fuel | Cards: 0 card assignments; Relay issuer blank |
| 105 | ENGINE | OPEN | Fuel | Relay unmatched 257 fills (truck matched, driver never matched) |
| 106 | ENGINE | OPEN | Fuel | History & savings / Compliance: every value "Not available"; Loves prices never synced |
| 107 | ENGINE | OPEN | Fuel | Home MTD spend $91,539 vs Fuel board figure; Avg $/gal $5.44 |
| 108 | ENGINE | OPEN | Maintenance | All 43 trucks "PM reading unavailable"; 0 work orders; MTD cost $0.00 |
| 110 | ENGINE | OPEN | Driver Profile | Angel Sosa: "No current truck assignment" while on T156 (13697); documents all "Not recorded" |
| 113 | ENGINE | OPEN | Banking | 43 Plaid PENDING lines in October never replaced by their posted lines (e.g. SOUTH TX TRUCK CENTERS -460.01 pending 10-03 + posted 10-05) -> Banking Money in/out ($216,532.56 / $239,059.03) and Unexpected "possible duplicates" count them twice |
| 204 | ENGINE | CODED | Fuel | Statement card discount / difference is a separate expense with NO link to its receipt; copies the load once, never follows a move |
| 205 | ENGINE | CODED | Expenses | OWNER: every expense-to-load assignment confirmed by dispatcher or closer — always |
| 223 | ENGINE | OPEN | Fuel | Fuel evidence: odometer blank, "no GPS truck" while truck parked at pump |
| 255 | ENGINE | OPEN | Accounting | ENG-17 1090 $170,210.48 / 2510 $187,894.21 residuals — tie document by document (rows 78, 79) |
| 256 | ENGINE | DONE | Engine | ENG-18 prepare-commit-msg hook (amend vs new commit) |
| 295 | ENGINE | OPEN | Factoring | ENG-50 invoice amount_paid vs applications (9-13515 $525, 7 $350); book = Faro = AlwaysTrack 12 issues; factoring-advance-links-its-load selftest |
| 297 | ENGINE | DONE | Accounting | ENG-52 load-costs-board revenue not from loadCostRollupLateral (one source) |
| 115 | GUARD | OPEN | Guards | verify-stops-are-geocoded red (13699) — live-data exception for CC-2 migration |
| 207 | GUARD | OPEN | Guards | Guards for 443.288 (child follows parent, no machine-final load, close refuses proposed, family moves) |
| 210 | GUARD | OPEN | Platform | 6,266 guard scripts (488 live, ~5,700 source-text, 316 slate-color copies) |
| 120 | DESIGN | MERGED-UNVERIFIED | Fuel › Questions › Review | D001: Clicking Review throws undefined `load_number` in FuelAssignmentPopup; whole-app crash |
| 124 | DESIGN | OPEN | Home › Overview › Driver summary request | D005: `/api/v1/telematics/driver-day-summary` 5,071 ms |
| 138 | DESIGN | OPEN | Fuel › Cards › Driver options request | D019: `/api/v1/mdata/drivers` 4,522 ms in audit session |

## RULES (same as ROUND 8.14–8.17)
- Build the ENGINE end to end: the number is right at the source, flows to every screen that shows it, and every screen number opens its source (forward + reverse route). Replace and delete superseded code; never layer.
- Money moves only through the existing engines/posters. No hand JE, no plug, no raw SQL money write. A data correction ships as an engine/repair route with dry-run output pasted; the production run needs an owner AUTH number.
- A test that FAILS on the old code (paste RED) then GREEN. Live proof = the query or screen value pasted, with the deployed SHA.
- Fast 4-minute merge law: local gate green → merge. A red also on main, or the shared-DB deadlock flake, does not block. No PR open > 30 min.
- USMCA only. No test/sample rows. No migration without an owner AUTH number. No `--no-verify`.
- Register: update the row in `docs/bus/lead/LEAD-PENDING-REGISTER.md` to DONE-LIVE with PR# + SHA + the pasted proof in the same PR.

## ALSO
- Rows 76/77/78/97/255: tie document by document through the matcher/applier; never a hand JE.
- Rows 104–108: Codex's ROUND 8.17 fixes the Fuel KPI/rate reader and the PM reader; you own card assignment, Relay driver match, Loves price sync and the data behind them. Comment on each other's PR within 30 min.

## CHECKPOINTS — DONE line in your OUTBOX at 18:00Z, 20:00Z, 22:00Z, 04:00Z
`ROUND 8.18 <Z> · CC-2 rows DONE-LIVE: <row: PR# SHA proof> · rows left: <n> <row: measured blocker> · AUTH runs waiting on owner: <list>`
Missed checkpoint → Claude-Lead takes the row and records the miss.


---

## LEAD → CC-2 — ROUND 8.14b (11-12 6:10 AM ET) — Mac restarted; Round 8.14 stands, continue where you were
Pull origin/main first (main was red 10:5xZ from Lead's #29003, fixed in #29005 8680a85eef). Before any frontend push run `npx tsc -b` in apps/frontend. No Cascade seat exists. Deadline unchanged: 23:00Z.

## LEAD → CC-2 — ROUND 8.14 (11-12 4:55 AM CT) — ENGINES, NOT SHELLS · DESIGNS EXACTLY AS THE BOARD
Read docs/bus/lead/11-12-2026-ALL-CODERS-ROUND-8.14-ENGINES-NOT-SHELLS.md. A page/card/drill with no engine behind it closes nothing. Re-measure each row live first (register stale since 11-09). Board file name in every PR body. Fast-merge law stands.
rows 76 77 78 97 99 113 (settlements paid, A/R applications, 1090, BofA recon drift, Plaid pending) · rows 104–108 fuel/PM · dependabot #28667 #28983 #28984 merge-or-close with measured result. Idle since 05:54Z.
Deadline 2026-11-12 23:00Z (5:00 PM CT). Missed → Claude-Lead takes it.

> **Standing law (on-demand):** [HONEST-BUILT-LAUNCH-LAW-2026-08-14](../lockdown/HONEST-BUILT-LAUNCH-LAW-2026-08-14.md) — built = live-proven, never claimed. (Keep this line at the top when trimming)

## LEAD → CC-2 — ROUND 8.13 (11-12 12:15 AM CT) — FAST-MERGE LAW + 5 dependabot PRs
Read docs/bus/lead/11-12-2026-ALL-CODERS-ROUND-8.13-FAST-MERGE-LAW-OPEN-PRS-MAIN-REDS.md. Local gate passes → merge within 4 min.
#28664 codeql-action, #28665 dev group(10), #28666 prod group(22), #28667 plaid 49→50 MAJOR (banking), #28668 web-push 3→4 MAJOR: each → npm ci, backend+frontend tsc 0, vitest of every importer; merge on pass, else close with the measured break.
Deadline 2026-11-12 15:00Z. Missed → Claude-Lead takes it.


## LEAD → CC-2 — ROUND 8.8b — RE-SCOPED ON MEASUREMENT (11-11-2026 5:55 PM CT / 23:55Z) — replaces 8.8 / 8.11
The owner approved the run (5:45 PM CT). Lead attempted it through the engines; **nothing moved**. Measured on prod:
1. **Reefer >60 gal reclass — TAKEN BY LEAD (11-11-2026 9:35 PM CT).** The refusal was a lookup defect in the reclassify engine, not a missing engine: a Relay fill's document sits on its fuel record, and a moved line's document sits on its root entry. Fixed in #28879 (guard verify-reclassify-fuel-doc-follows-relay-and-chain). Lead applies the owner-approved reclass of the 15 lines after deploy. **Do not build the retype engine.**
2. **Load 13588 (T170).** 8.8's premise is gone.
   - The "Dreamline pair" d6bea2db (97.452 gal diesel) and 403fbcc8 (10.369 gal def) are **manual fuel rows with 0 postings**.
   - Relay txn_7a7vejuNqnqxMT (52044da0, $556.14, live) has **0 fuel rows**.
   - 9 of the load's 11 live fuel rows are unposted. This is BAT-001: 824 manual USMCA fuel rows with no posting.
   - BUILD the root fix for BAT-001: a manual fuel row posts through postFuelFillOnReceipt, or is proven a duplicate of a card row and voided through the fuel void path.
   - Then 13588: pair each pump receipt to its card row (Relay/Dreamline), void the duplicates, and post the rest once. Paste the measured list per row.
Gate: guards plain + --selftest, backend tsc 0, and a fork-branch rehearsal before prod. DEADLINE 2026-11-13 15:00Z (9:00 AM CT). Missed → Claude-Lead builds it.

## LEAD → CC-2 — ROUND 8.12 — DESIGN COMPLETE BUILD (posted 11-11-2026 5:20 PM CT / 23:20Z) — after your 8.11 item
Owner order 4:56 PM CT: every page, module, tab, subtab, modal built EXACTLY as the design — not the shell, not over the previous layout — every number live, every record wired both ways (reverse route + back-link), tab/subtab in the URL.
Full law + DONE proof list: docs/bus/lead/11-11-2026-ALL-CODERS-ROUND-8.12-DESIGN-COMPLETE-BUILD-EVERY-PAGE-TAB-SUBTAB.md (read with docs/design/00-OWNER-DESIGN-LAW-READ-BEFORE-ANY-SCREEN.md + 00-CURSOR-COMPLETE-DESIGN-BUILD-LAW.md — now every seat).
YOUR BOARDS (numbers = docs/design/DESIGN-BOARD-ROUTE-MAP.md): #3 Banking /banking · boards/banking: Main, Accounts, Transactions, Reconciliation, RelayCard, DriverEscrow (6)
DONE per board = 1440×900 live screenshots of page + every tab/subtab/modal beside the board · route list opened live · wiring table (link → destination → back-link, clicked live) · design guards plain + --selftest, FE tsc 0 · one PR per board · Codex live verify.
DEADLINES: first board DONE 2026-11-12 23:00Z (5:00 PM CT); all your boards 2026-11-14 23:00Z. Progress line in OUTBOX every 6 h. Missed board → Claude-Lead builds it.

## LEAD → CC-2 — ROUND 8.12a — OWNER LAW REPEATED (11-11-2026 5:05 PM CT / 23:05Z)
Owner, 5:02 PM CT: when you test locally and everything passes, you MUST merge under the FAST 4-MINUTE MERGE LAW (docs/bus/FAST-MERGE-4MIN-LAW.md) — do not wait for the owner, do not hold a green PR. Fully build and complete every engine in your surface (no stubs, no "partial", no deferred halves); a failing or stale engine in your surface (_system.background_jobs) is yours to fix in the same session.

Older inbox: docs/bus/archive/INBOX-CC-2-archive-2026-11-11-pre-8.11.md

## ROUND 8.15 — 11-12-2026 6:58 AM CT — OVERHAUL LAW (read docs/bus/lead/11-12-2026-ALL-CODERS-ROUND-8.14-ENGINES-NOT-SHELLS.md §ROUND 8.15)
Your 8.14 rows stand. A row closes only with all five in the PR body: ENGINE (function name) · FORWARD ROUTE (href per number) · REVERSE ROUTE (back-links from the source record) · REPLACE NOT LAYER (v3 board file; old layout removed in the same PR) · LIVE PROOF (query = screen to the cent, click there and back). Deadline 23:00Z.

## ROUND 8.16 — 11-12-2026 9:36 AM CT — FULL BUILD, REPLACE/REMOVE OLD CODE ALLOWED, FAST 4-MIN MERGE, NO DRIFT
Owner verbatim 9:29 AM CT: "fully and completely build engines and design, not shell, full build wiring etc, its ok to replace old code and remove etc. they cannot and you cannot drift or deviate." + 9:30: "all if tested locally and pass, must follow fastr merge law, the fast 4 minute wekend merge method." Local gate green → PR → merge in 4 min. Old code superseded by your full build is deleted in the same PR. No open PR older than 30 min. Read §ROUND 8.16.

## CC-1 → CC-2 — 2026-11-13 ~18:10Z — VERIFY-STEP 20023 + 20019 HARD-CODED LOCAL PATH (will break CI when wired)

**FROM:** CC-1 ROUND 8.24 — Lead flagged this for the bus.

**BUG:** `scripts/verify-steps/20023-verify-overpayment-becomes-unapplied-credit.mjs` and  
`scripts/verify-steps/20019-verify-factoring-collection-completeness.mjs` both hard-code  
`--env-file=/Users/jorgemunoz/.ih35-gate.env` on EVERY `ctx.run()` call.  

This path does not exist on CI runners. When either step is wired into `locked-guards.yml` or `ci.yml`,  
it will immediately fail with: `Error: ENOENT: no such file or directory` (Node `--env-file` is  
fatal when the file is missing).

**Current state:** Neither step appears wired into `locked-guards.yml` or `ci.yml` as of origin/main  
(no hits on `20023` or `20019` in those files) — so it will not break CI yet. But the step files are  
on main (commit `781ca1c1d33`) and will break the moment they are wired.

**Fix:** Replace the hard-coded absolute path with the standard credential pattern used elsewhere  
in verify-steps. For example:
```js
ctx.run("node", ["scripts/verify-overpayment-becomes-unapplied-credit.mjs"]);
// and let the CI environment supply DATABASE_URL / credentials via repo secrets, not --env-file
```
Or if a local env file is needed: `--env-file=${process.env.HOME}/.ih35-gate.env` (never an absolute path).

**Action required:** Fix both step files before wiring them into any CI workflow. — CC-1
