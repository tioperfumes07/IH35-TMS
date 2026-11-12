# ROUND 8.18 — CC-1 / CC-2 / CC-3 — every pending engine built today

# CC-1 — ROUND 8.18 — BUILD EVERY PENDING ENGINE TODAY · deadline 2026-11-13 04:00Z (10:00 PM CT)
From Claude-Lead, 11-12-2026 10:25 AM CT (16:25Z). Owner, verbatim: "i need all the ngines built doay no excuses from cc1,2 and 3."

Measured: `docs/bus/lead/LEAD-PENDING-REGISTER.md` on main (bb8a165c08) with your OUTBOX claims through 16:00Z applied. You own **30 open rows** (28 engine, 0 guard, 2 design) — money / settlements / reports engines. Every one closes today: DONE-LIVE with proof, or FIXED in the engine with the owner AUTH run named.

| Row | Kind | Status now | Area | Item |
|---|---|---|---|---|
| 28 | ENGINE | OPEN | Reports | Load History tab + Settlement (driver/company), Loads, Customers, Vendors reports |
| 66 | ENGINE | OPEN | Reports/Dispatch | Dispatch › Load history (198 loads, every cell opens its record, load detail panel with timeline + money + linked records) |
| 67 | ENGINE | OPEN | Reports/Dispatch | Reports › Loads report (week/month/customer/driver/truck/lane/trip type) |
| 68 | ENGINE | OPEN | Reports/Dispatch | Reports › Driver settlement report (by settlement / driver, paid state) |
| 69 | ENGINE | OPEN | Reports/Dispatch | Reports › Company settlement report (profit per closed trip) |
| 70 | ENGINE | OPEN | Reports/Dispatch | Reports › Customer report (sales, open, aging, statement) |
| 71 | ENGINE | OPEN | Reports/Dispatch | Reports › Vendor report (spend, open bills, category, 1099) |
| 72 | ENGINE | OPEN | Reports/Dispatch | Reports home: add the 5 reports to the catalog; remove unrouted duplicates LoadHistoryPage.tsx / LoadsReportPage.tsx by replacing them with the board pages |
| 79 | ENGINE | OPEN | Cash Flow | Card payables not in forecast: Dreamline 2510 $187,894.21, WEX 2520 $29,156.88 |
| 82 | ENGINE | PARTIAL | Accounting | Rafael salary bill P-0069 / 13530 $300 unpaid since 08-21, due_date NULL |
| 85 | ENGINE | PARTIAL | Vendors | All 30 vendors have no category |
| 86 | ENGINE | PARTIAL | Settlements | 3 recent closed settlements have no number / company settlement not opened (P-0119, P-0113, P-0117) |
| 89 | ENGINE | CODED | Cash Flow | Three different opening-cash figures: Home $25,533.37, Manual bank total $102,867.17, Manual opening $0.00 |
| 90 | ENGINE | CODED | Cash Flow | Manual "bank balances" counts card payables and Faro as cash: Dreamline -$140,226.34 (GL 2510 -$187,894.21), WEX +$29,156.88 (a payable shown positive), Faro Factoring $175,650.00 |
| 94 | ENGINE | CODED | Accounting | Open invoices header $624,076.72 / 165 vs aging $621,076.72 / 164 (proforma 169-13690 $3,000 counted in header) |
| 101 | ENGINE | OPEN | Vendors | 86 possible duplicate vendors; Open bills $126,443.92 includes driver bills; Spend YTD $351,241.23 vs expenses $353,241.23 |
| 212 | ENGINE | CODED | Settlements | Settlement number: P-number shown; real series not assigned by our system |
| 213 | ENGINE | CODED | Settlements | Tour dates wrong (P-0114 10/20→10/20; real 10/16→10/23) |
| 214 | ENGINE | CODED | Settlements | Settlements tab week list: closed show Open; duplicate empty driver rows |
| 215 | ENGINE | PARTIAL | Settlements | Escrow register: all same date/source, no load numbers; escrow is per load |
| 216 | ENGINE | OPEN | Accounting | Bill Payments shows driver escrows — not bill payments |
| 227 | ENGINE | INPROGRESS | Settlements | OWNER 10-24: P-0123/P-0124/P-0125 duplicates deleted completely + tour-close engine never opens a settlement for a settled load |
| 242 | ENGINE | PARTIAL | Accounting | ENG-04 2170 Driver Net-Pay Clearing Cr $2,575.96 / 12 postings — tie to open net pay, clear through documents |
| 269 | ENGINE | PARTIAL | Engine | ENG-34 920 guard-exempt entries (CI does not run them) — wire or delete, shrink-only |
| 289 | ENGINE | PARTIAL | Driver pay | ENG-44 bill 13697 due date; salaried stray bill not voided; presettlement autolink 13556/13563; live_load_number self-referential 13694/13695 |
| 291 | ENGINE | PARTIAL | Accounting | ENG-46 bill_payment ad02cc37 no source link; escrow sub-ledger 315,000¢ vs baseline 132,500¢; 5796/P-0102 USMCA settlement for a Transportation document |
| 292 | ENGINE | PARTIAL | Engine | ENG-47 guards stale vs owner rulings: TIO PERFUMES kept; voids are design; S-13655/56; unbilled revenue migration; 'USMCA hidden'; archive tables RLS |
| 309 | ENGINE | PARTIAL | Legal | ENG-60 retire the insurance.lawsuit side table: PolicyDetail lawsuit section → legal matters by claim, claim.lawsuit_id → legal matter, LawsuitsTab + 17 guards that read it; drop table after 0 rows all entities |
| 146 | DESIGN | OPEN | Dispatch › Load Costs › Settlement/Tour link | D027: Several links have only an em dash as label despite a settlement destination |
| 165 | DESIGN | OPEN | Banking › Home › Drift account label | D046: Several alerts show only generic Account rather than the account display name |

## RULES (same as ROUND 8.14–8.17)
- Build the ENGINE end to end: the number is right at the source, flows to every screen that shows it, and every screen number opens its source (forward + reverse route). Replace and delete superseded code; never layer.
- Money moves only through the existing engines/posters. No hand JE, no plug, no raw SQL money write. A data correction ships as an engine/repair route with dry-run output pasted; the production run needs an owner AUTH number.
- A test that FAILS on the old code (paste RED) then GREEN. Live proof = the query or screen value pasted, with the deployed SHA.
- Fast 4-minute merge law: local gate green → merge. A red also on main, or the shared-DB deadlock flake, does not block. No PR open > 30 min.
- USMCA only. No test/sample rows. No migration without an owner AUTH number. No `--no-verify`.
- Register: update the row in `docs/bus/lead/LEAD-PENDING-REGISTER.md` to DONE-LIVE with PR# + SHA + the pasted proof in the same PR.

## ALSO
- AUTH-476 / 477 / 478 repair routes are merged; the owner runs them. Paste each dry-run result (counts, ids, amounts) in OUTBOX so he can run them.
- Rows 66–72 (Load History + 5 reports): coordinate with Cursor's ROUND 8.17 board work — you own the report ENGINES (numbers, populations, drills' targets); Cursor owns the board UI. Comment on each other's PR within 30 min.

## CHECKPOINTS — DONE line in your OUTBOX at 18:00Z, 20:00Z, 22:00Z, 04:00Z
`ROUND 8.18 <Z> · CC-1 rows DONE-LIVE: <row: PR# SHA proof> · rows left: <n> <row: measured blocker> · AUTH runs waiting on owner: <list>`
Missed checkpoint → Claude-Lead takes the row and records the miss.

---

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

