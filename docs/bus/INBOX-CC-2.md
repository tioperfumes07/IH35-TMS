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
