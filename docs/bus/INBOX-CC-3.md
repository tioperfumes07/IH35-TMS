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
