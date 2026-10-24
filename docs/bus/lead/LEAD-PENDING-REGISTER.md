# IH35-TMS — Lead pending register (USMCA) · 10-24-2026 07:44 AM CT · CODE-COMPLETE MODE · deadline 10-24 10:00 AM CT

Source of truth: LEAD-PENDING-REGISTER.xlsx (same rows). DONE only with live proof.

| # | Section | Area | Item | Seat | Round | Status | Proof |
|---|---|---|---|---|---|---|---|
| 1 | A | Design | All module designs, higher quality, shown inside the live app (V3) | LEAD | 443.248-250 | DONE-LIVE | canvas DuE4p2MZHjxXEtnboiuEBx |
| 2 | A | Accounting | Driver bill due date = load (projected) delivery date | CC-1 | 443.264/265-E5 | DONE-LIVE | AUTH-456; 77fb8fc2 |
| 3 | A | Dispatch | Kanban: truck cards drag to assign/book/availability | LEAD | 443.251 | MERGED-UNVERIFIED | 49d1d51c 4313ac46 |
| 4 | A | Dispatch | Planners: range in filters, resizable columns, selected days fill width | LEAD | 443.251 | DONE-LIVE | 9420c223 3296405d |
| 5 | A | All | Names proper-case automatically (people), org casing kept (ACME) | CC-3 | 443.266-A | PARTIAL | acf2e901 #27308 |
| 6 | A | Driver/Fleet | Driver photo from uploaded IDs; unit photos | CC-2 | 443.252 | OPEN |  |
| 7 | A | Settlements | Settlement number column opens the statement | CURSOR | 443.252/274-C | DONE-LIVE | c94e69d9 |
| 8 | A | Settlements | Navigation defects N1-N10 (tabs leave module, escrow dupes, $2575.96, initials) | Cursor | 443.254 | PARTIAL |  |
| 9 | A | Dispatch | Truck Line status opens searchable dropdown | Cursor | 443.256 | MERGED-UNVERIFIED | 17467838 |
| 10 | A | Dispatch | Book Load: NB/TR/SB, no driver pay rate, miles DB + Google | LEAD/CC-3 | 443.257/265-A | DONE-LIVE | 0584599a 1bfd56cc |
| 11 | A | Dispatch | Truck Line "Assign a load" on every available truck (no driver) | LEAD | 443.257-A | DONE-LIVE | #27235 |
| 12 | A | Fuel | Fuel Questions Review crash (load_number undefined) | CC-2 | 443.258 | MERGED-UNVERIFIED | bf7dadd3 |
| 13 | A | Process | Fast-merge law (4-min) + ruling 443.261 | ALL | 443.255/261 | DONE-LIVE | docs/bus/FAST-MERGE-4MIN-LAW.md |
| 14 | A | Dispatch | Stops 13541 s3 / 13576 s2,s3 completed via engine | LEAD | 443.248 | DONE-LIVE | docs 5796/5804 |
| 15 | A | Settlements | Pre-Settlements: Load #, Entries, Ready-to-close, Close, clickable, responsive, miles DB+Google | CC-3 | 443.269-A | MERGED-UNVERIFIED | #27364 d6e9d60b 5:07 PM |
| 16 | A | Settlements | A miles change at settlement re-prices the bills everywhere | CC-2 | 443.269-B | CODED | 891305b339 #27414 (CC-2) |
| 17 | A | Repo | Everything in the repo: 36 boards + PNGs + Lead register + rounds | LEAD | 443.270 | DONE-LIVE | #27365 ee5b7359 |
| 18 | A | Design | Every board implemented exactly (no layering) | CC-3 | 443.280 | OPEN |  |
| 19 | A | Data | One canonical source per entity across all views of the same type | CC-3 | 443.270-B | BLOCKED |  |
| 20 | A | Data | Merge all duplicate customers / vendors / drivers | LEAD/CC-2 | 443.270-C | DONE-LIVE | merge-all 10-23 3:20 PM |
| 21 | A | Accounting | QuickBooks unapplied credit: paid bill/invoice reduced below paid -> unapplied credit on payee | CC-2 | 443.270-C d | OPEN |  |
| 22 | A | Banking | Relay: nothing stored under TRANSP; 10/09 fundings on TRANSP bank; deposit ingest stopped after 10-09; bank feed last 10-21 | CC-2 | 443.270-C e | OPEN |  |
| 23 | A | Deploy | Render web build failures | CURSOR/CC-3 | 443.270-G | DONE-LIVE | dep-dbdmto942hec739cukkg |
| 24 | A | Process | Lead codes, not only coordinates | LEAD |  | DONE-LIVE | ea1591f5 a37a2712 a9f01fab |
| 25 | A | Cash Flow | Driver pay counted twice (settlement + per-load A/P inside it) | LEAD | 443.276 | DONE-LIVE | #27353 a9f01fab, dep-dbdsrbaqqsrs73d7g1m0 |
| 26 | A | Data | Find real root causes of loads/settlements data issues | LEAD | 443.279 | DONE-LIVE | journal 4:35 PM |
| 27 | A | Data | Delete USMCA test records (18 legal matters, 5 policies, 7 claims, 1 accident…) | CC-2 | 443.247 | CODED | 0ee3451d41 #27457 (CC-2) — deployed 0ee3451 11:04 PM CT; prod purge run = Lead under AUTH-451 |
| 28 | A | Reports | Load History tab + Settlement (driver/company), Loads, Customers, Vendors reports | CC-1 | 443.281 | OPEN |  |
| 29 | A | All | LAW 5:08 PM: every selector is multi-select (units, loads, settlements, trucks, trailers, drivers, customers, vendors…) everywhere | LEAD | 443.281 | OPEN |  |
| 30 | A | All | Baseline screenshots of every page before the rebuild | LEAD | 443.281 | DONE-LIVE | #27369 9932b495 |
| 31 | B | Cash Flow | Cash Flow › Home — board verdict PARTIAL | Cursor | 443.280 | CODED | #27453 (Home unchanged = board) |
| 32 | B | Cash Flow | Cash Flow › Projected (Auto) — board verdict PARTIAL | Cursor | 443.280 | CODED | #27453 |
| 33 | B | Cash Flow | Cash Flow › Actual vs Projected — board verdict PARTIAL | Cursor | 443.280 | CODED | #27453 AvP board restored |
| 34 | B | Cash Flow | Cash Flow › Rolling Ledger — board verdict LAYERED | Cursor | 443.280 | CODED | #27453 |
| 35 | B | Cash Flow | Cash Flow › Manual — board verdict LAYERED | Cursor | 443.280 | CODED | #27453 Manual board + opening cash |
| 36 | B | Accounting | Accounting › Home — board verdict REBUILT | CURSOR | 443.280 | DONE-LIVE |  |
| 37 | B | Accounting | Accounting › Unexpected — board verdict REBUILT | Cursor | 443.280 | PARTIAL |  |
| 38 | B | Banking | Banking › Home — board verdict REBUILT | Cursor | 443.280 | PARTIAL |  |
| 39 | B | Factoring | Factoring › Home — board verdict LAYERED | Cursor | 443.280 | OPEN |  |
| 40 | B | Reports | Reports › Home — board verdict LAYERED | CC-3 | 443.280 | OPEN |  |
| 41 | B | Reports | Reports › Trial balance viewer — board verdict PARTIAL | CC-3 | 443.280 | PARTIAL |  |
| 42 | B | Customers | Customers › Home — board verdict CHROME-ONLY | CC-3 | 443.280 | OPEN |  |
| 43 | B | Vendors | Vendors › Home — board verdict CHROME-ONLY | CC-3 | 443.280 | OPEN |  |
| 44 | B | Settlements | Settlements › Home — board verdict LAYERED | Cursor | 443.280 | OPEN |  |
| 45 | B | Settlements | Settlements › Open — board verdict PARTIAL | Cursor | 443.280 | PARTIAL |  |
| 46 | B | Settlements | Settlements › Closed — board verdict PARTIAL | Cursor | 443.280 | PARTIAL |  |
| 47 | B | Settlements | Settlements › Statement — board verdict LAYERED | Cursor | 443.280 | MERGED-UNVERIFIED | #27368 0c5f5376 Cursor 5:26 PM |
| 48 | B | Settlements | Settlements › Pre-Settlements — board verdict LAYERED | Cursor | 443.280 | MERGED-UNVERIFIED | #27364 d6e9d60b 5:07 PM |
| 49 | B | Settlements | Settlements › Close — board verdict LAYERED | Cursor | 443.280 | OPEN |  |
| 50 | B | Settlements | Settlements › Company — board verdict REBUILT | Cursor | 443.280 | PARTIAL | #27354 e8a9f02b; duplicate rows still live |
| 51 | B | Settlements | Settlements › Deductions — board verdict CHROME-ONLY | Cursor | 443.280 | MERGED-UNVERIFIED | #27355 / #27364; live 5:37 PM: by-type rows still "—" while total $470.00 |
| 52 | B | Settlements | Settlements › Cash Advances — board verdict CHROME-ONLY | Cursor | 443.280 | MERGED-UNVERIFIED | #27358 eb08254d; live 5:38 PM page stuck "Loading…" |
| 53 | B | Settlements | Settlements › Escrow — board verdict CHROME-ONLY | Cursor | 443.280 | OPEN |  |
| 54 | B | Settlements | Settlements › Escrow Register — board verdict PARTIAL | Cursor | 443.280 | PARTIAL |  |
| 55 | B | Fuel | Fuel › Home — board verdict CHROME-ONLY | Cursor | 443.280 | OPEN |  |
| 56 | B | Fuel | Fuel › 10 sub-tabs — board verdict CHROME-ONLY | Cursor | 443.280 | OPEN |  |
| 57 | B | Safety | Safety › Driver Files — board verdict LAYERED | CODEX | 443.280 | DONE-LIVE | #27367 40daa907; live 5:37 PM board only |
| 58 | B | Maintenance | Maintenance › Home — board verdict PARTIAL | LEAD | 443.280 | CODED | 893cc58eba #27375 + Home board: 4 tiles, fleet health line, PM countdown/engines/alerts/in-transit/severe, Arriving soon, At risk (all design sections; legacy strips gated to Settings / non-Home); 'PM reading unavailable' = row 108 (CC-2 odometer) |
| 59 | B | Maintenance | Maintenance › In Shop — board verdict LAYERED | LEAD | 443.280 | OPEN |  |
| 60 | B | Driver Profile | Driver Profile › Board — board verdict NOT STARTED | LEAD | 443.280 | CODED | 8027099748 #27357 board (4 panels) + 75f1ed41d2 443.280 board-only test; RE-INSPECT at end: owner saw old layout + ~15 s load at 5:38 PM (before 443.280); 'No current truck assignment' = row 110 (CC-2) |
| 61 | B | Dispatch | Dispatch › Truck Planner — board verdict PARTIAL | CC-3 | 443.280 | MERGED-UNVERIFIED | 4ff9f272 bars lane + $/mi; #27359 |
| 62 | B | Dispatch | Dispatch › Book Load modal/side/spec — board verdict PARTIAL | CC-3 | 443.280 | MERGED-UNVERIFIED | 4ff9f272 1260/760, Load # right |
| 63 | B | Dispatch | Dispatch › Book Load trip types — board verdict REBUILT | CC-3 | 443.280 | DONE-LIVE |  |
| 64 | B | Insurance | Insurance › Home — board verdict REBUILT | LEAD | 443.280 | CODED | d7e5e14e54 #27323 board (all design sections) + 8cff827545 #27400 own module shell; Lawsuits tab kept (not on the board) — owner decides |
| 65 | B | Legal | Legal › Home — board verdict REBUILT | CURSOR | 443.280 | DONE-LIVE |  |
| 66 | C | Reports/Dispatch | Dispatch › Load history (198 loads, every cell opens its record, load detail panel with timeline + money + linked records) | CC-1 | 443.281 | OPEN |  |
| 67 | C | Reports/Dispatch | Reports › Loads report (week/month/customer/driver/truck/lane/trip type) | CC-1 | 443.281 | OPEN |  |
| 68 | C | Reports/Dispatch | Reports › Driver settlement report (by settlement / driver, paid state) | CC-1 | 443.281 | OPEN |  |
| 69 | C | Reports/Dispatch | Reports › Company settlement report (profit per closed trip) | CC-1 | 443.281 | OPEN |  |
| 70 | C | Reports/Dispatch | Reports › Customer report (sales, open, aging, statement) | CC-1 | 443.281 | OPEN |  |
| 71 | C | Reports/Dispatch | Reports › Vendor report (spend, open bills, category, 1099) | CC-1 | 443.281 | OPEN |  |
| 72 | C | Reports/Dispatch | Reports home: add the 5 reports to the catalog; remove unrouted duplicates LoadHistoryPage.tsx / LoadsReportPage.tsx by replacing them with the board pages | CC-1 | 443.281 | OPEN |  |
| 73 | E | Driver pay | 3 delivered loads never accrued to A/P: 13663, 13687, 13688 ($2,056.34) | CC-1 | 443.279 | OPEN |  |
| 74 | E | Dispatch | 4 loads delivered_pending_docs with no final-stop actual departure: 13691, 13694, 13696, 13697 | CC-3 | 443.279 | MERGED-UNVERIFIED | #27360 528fd12c delivered only via final stop + history repair; 358b7c12 |
| 75 | E | Settlements | Settlement load-cost totals 25-50% below recount; P-0119/P-0113 $0 costs; GPS real miles 4,855 vs 1,110 | CC-1 | 443.278 | OPEN |  |
| 76 | E | Settlements | 0 of 85 closed settlements marked paid ($127,897.75) | CC-2 | 443.281 | OPEN |  |
| 77 | E | A/R | 0 customer payments / Faro purchases applied: all $621,076.72 open incl. 57 advanced invoices | CC-2 | 443.279 | OPEN |  |
| 78 | E | Banking | 1090 Undeposited $170,210.48 (33 Faro advances never deposited) -> GL bank -$88,433.89 | CC-2 | 443.277-A/279 | OPEN |  |
| 79 | E | Cash Flow | Card payables not in forecast: Dreamline 2510 $187,894.21, WEX 2520 $29,156.88 | CC-1 | 443.277-B | OPEN |  |
| 80 | E | Dispatch | Load 13699 Bradley IL delivery stop city-only (no street/ZIP) | CC-3 | 443.278 | OPEN |  |
| 81 | E | HOS | 222,587 duty events on merged driver shells | CC-2 | 443.278 | OPEN |  |
| 82 | E | Accounting | Rafael salary bill P-0069 / 13530 $300 unpaid since 08-21, due_date NULL | CC-1 | 443.279 | OPEN |  |
| 83 | E | Accounting | R2: 241 Dreamline statement discount JEs ($10,744.65) -> card-credit documents | CC-2 | 443.260 | PARTIAL | afd3fd334e #27384 coded; prod 198/241 done TB 0; 43 left PAUSED (AUTH-453, owner renews) |
| 84 | E | Settlements | 5 settlement headers re-derive (P-0105/0107/0108/0109/0115); P-0115 carries two NBs incl. 13663 | CC-2 | 443.260 | CODED | afd3fd334e #27384; prod AUTH-454 run done, TB 0 |
| 85 | E | Vendors | All 30 vendors have no category | CC-1 | 443.281 | OPEN |  |
| 86 | E | Settlements | 3 recent closed settlements have no number / company settlement not opened (P-0119, P-0113, P-0117) | CC-1 | 443.281 | OPEN |  |
| 87 | E | Telematics | verify-no-dead-schema: telematics.vehicle_latest_position_cache has no reader | CC-1 | 443.278 | DONE-LIVE | LEAD #27383 d85ade3b: guard credits view-read tables; verify-no-dead-schema exit 0 on main |
| 88 | E | Live gate | No-5xx live GET guard | CC-3 | 443.268-A | DONE-LIVE | #27346 + be076e3d fastify.inject |
| 89 | F | Cash Flow | Three different opening-cash figures: Home $25,533.37, Manual bank total $102,867.17, Manual opening $0.00 | CC-1 | 443.281 | CODED | d86e35ce75 #27453 LEAD 443.283 opening cash = operating accounts $25,533.37 |
| 90 | F | Cash Flow | Manual "bank balances" counts card payables and Faro as cash: Dreamline -$140,226.34 (GL 2510 -$187,894.21), WEX +$29,156.88 (a payable shown positive), Faro Factoring $175,650.00 | CC-1 | 443.281 | CODED | d86e35ce75 #27453 LEAD 443.283 cards/Faro no longer counted as cash |
| 91 | F | Cash Flow | Actual vs Projected: Actual income $0.00 every day 10-16..10-23 while BofA received deposits (Faro wire +$10,629.09 10-22) | CC-1 | 443.281 | DONE-LIVE | LEAD #27383 live: AvP Oct actual income $208,031.56 / expense $205,270.54 from operating bank; 283b is_credit form |
| 92 | F | Cash Flow | Rolling Ledger lists Faro advances FAC-2026-00009… as income 49-74 days overdue (advance money already received = double count with 1090) | CC-1 | 443.281 | DONE-LIVE | LEAD #27383: rolling ledger factoring advances matched by bt.matched_factoring_advance_id; no double count |
| 93 | F | Accounting | Open bills $126,443.92 / 179 vs A/P subledger $126,437.22 / 177 (diff $6.70, 2 bills) | CC-1 | 443.281 | OPEN |  |
| 94 | F | Accounting | Open invoices header $624,076.72 / 165 vs aging $621,076.72 / 164 (proforma 169-13690 $3,000 counted in header) | CC-1 | 443.281 | CODED | eef797220e #27452 LEAD 443.285 Open invoices = issued only = GL A/R $621,076.72 |
| 95 | F | Accounting | Cash pulse Oct: IN $0.00 / OUT $1,590.00 while Banking shows money in $216,532.56 / out $239,059.03 | CC-1 | 443.281 | OPEN |  |
| 96 | F | Accounting | QBO sync "Not connected" | OWNER | 443.281 | OPEN |  |
| 97 | F | Banking | Reconciliation drift: BofA bank $1,808.13 vs book -$88,433.89 (diff $90,242.02); Relay Fuel Wallet listed twice | CC-2 | 443.281 | OPEN |  |
| 98 | F | Factoring | KPI renders raw "175650.000000000000" and "170210.480000000000"; True cost 0.00% with fees $2,634.76 | Cursor | 443.281 | PARTIAL | main: NUMERIC fixed (7349992008); one-source True cost = Lead branch claude/lead-row98-factoring-kpi-units, pushing |
| 99 | F | Unexpected | Possible duplicates 0 while bank lines repeat (460.01 on 10-03 and 10-05; 155.86 twice on 10-07) | CC-2 | 443.281 | OPEN |  |
| 100 | F | Customers | 201 possible duplicate customers flagged; billed shows $624,076.72 (incl. proforma) | CC-3 | 443.281 | OPEN |  |
| 101 | F | Vendors | 86 possible duplicate vendors; Open bills $126,443.92 includes driver bills; Spend YTD $351,241.23 vs expenses $353,241.23 | CC-1 | 443.281 | OPEN |  |
| 102 | F | Settlements | Home "Week of Oct 18" lists closed settlements (P-0108 etc.) with status Open; "Settlement (Closed)" toggle empty; Drivers w/ debt 0 | Cursor | 443.281 | OPEN |  |
| 103 | F | Settlements | Company Settlements shows 0 / Loading for ~6 s before data (87 closed, 6 not opened) | Cursor | 443.281 | PARTIAL | #27354 e8a9f02b; duplicate rows still live |
| 104 | F | Fuel | Cards: 0 card assignments; Relay issuer blank | CC-2 | 443.281 | OPEN |  |
| 105 | F | Fuel | Relay unmatched 257 fills (truck matched, driver never matched) | CC-2 | 443.281 | OPEN |  |
| 106 | F | Fuel | History & savings / Compliance: every value "Not available"; Loves prices never synced | CC-2 | 443.281 | OPEN |  |
| 107 | F | Fuel | Home MTD spend $91,539 vs Fuel board figure; Avg $/gal $5.44 | CC-2 | 443.281 | OPEN |  |
| 108 | F | Maintenance | All 43 trucks "PM reading unavailable"; 0 work orders; MTD cost $0.00 | CC-2 | 443.281 | OPEN |  |
| 109 | F | Dispatch | Load board HOS columns blank for most trucks; Truck planner driver column "—" for trucks with drivers | CC-3 | 443.281 | OPEN |  |
| 110 | F | Driver Profile | Angel Sosa: "No current truck assignment" while on T156 (13697); documents all "Not recorded" | CC-2 | 443.281 | OPEN |  |
| 111 | F | Insurance | Insurance page renders inside the Safety header/tab shell | CC-2 | 443.281 | CODED | 8cff827545 #27400 — already on main; CC-2 verified /insurance/* InsuranceModuleShell |
| 112 | F | Legal | Open matters 0 on page while legal.matters holds 18 rows (test records) | CC-2 | 443.281 | OPEN |  |
| 113 | E | Banking | 43 Plaid PENDING lines in October never replaced by their posted lines (e.g. SOUTH TX TRUCK CENTERS -460.01 pending 10-03 + posted 10-05) -> Banking Money in/out ($216,532.56 / $239,059.03) and Unexpected "possible duplicates" count them twice | CC-2 | 443.282 | OPEN |  |
| 114 | A | Process | Cursor confirmation of 443.282 (owner-authorized build exactly as specified) | Cursor | 443.282 | OPEN |  |
| 115 | G | Guards | verify-stops-are-geocoded red (13699) — live-data exception for CC-2 migration | CC-2 | 443.278/280/281 | OPEN |  |
| 116 | G | Guards | verify-resettlement-origin-load-dates — guard retarget to board labels | CC-3 | 443.278/280/281 | MERGED-UNVERIFIED | #27356 6b9b2dc0 |
| 117 | G | Guards | verify-entity-label-rejects-uuid-shaped-name — restore protection in accounting hub | CC-3 | 443.278/280/281 | MERGED-UNVERIFIED | #27356 6b9b2dc0 |
| 118 | G | Guards | verify-board-page-no-legacy-sections (new) — stops layering | Codex | 443.278/280/281 | CODED | 3409d7a383 #27379 (Codex) selftest 10/10, scan 0 |
| 119 | G | Guards | verify-entity-filters-multi-select (new) — fails on single-select entity filters | LEAD | 443.278/280/281 | OPEN |  |
| 120 | H | Fuel › Questions › Review | D001: Clicking Review throws undefined `load_number` in FuelAssignmentPopup; whole-app crash | CC-2 | 443.257-D | MERGED-UNVERIFIED | bf7dadd3 |
| 121 | H | Home › Overview › Money tiles | D002: Currency values omit cents | Cursor | 443.257-D | OPEN | not re-verified since audit |
| 122 | H | Home › Overview › Driver day summary | D003: Names render all-uppercase | CC-3 | 443.257-D | OPEN | not re-verified since audit |
| 123 | H | Home › Overview › Weekly revenue | D004: Axis dates use DD/MM without year | Cursor | 443.257-D | OPEN | not re-verified since audit |
| 124 | H | Home › Overview › Driver summary request | D005: `/api/v1/telematics/driver-day-summary` 5,071 ms | CC-2 | 443.257-D | OPEN | not re-verified since audit |
| 125 | H | Settlements › Navigation › Drivers | D006: Link targets `/drivers` outside module | LEAD | 443.257-D | CODED | 0512ef14cd 443.258-B (tab -> /driver-finance/…, route mounted) + Lead guard verify-settlements-subnav-stays-in-module |
| 126 | H | Settlements › Navigation › Profiles | D007: Link targets `/drivers/profiles` | Cursor | 443.257-D | CODED | 0512ef14cd 443.258-B (tab -> /driver-finance/…, route mounted) + Lead guard verify-settlements-subnav-stays-in-module |
| 127 | H | Settlements › Navigation › Pre-Settlements | D008: Link targets `/drivers/pre-settlements` | Cursor | 443.257-D | CODED | 0512ef14cd 443.258-B (tab -> /driver-finance/…, route mounted) + Lead guard verify-settlements-subnav-stays-in-module |
| 128 | H | Settlements › Navigation › Feed Gate | D009: Link targets `/feed-gate` | Cursor | 443.257-D | CODED | 0512ef14cd 443.258-B (tab -> /driver-finance/…, route mounted) + Lead guard verify-settlements-subnav-stays-in-module |
| 129 | H | Settlements › Navigation › Cash Advances | D010: Link targets `/cash-advances` | Cursor | 443.257-D | CODED | 0512ef14cd 443.258-B (tab -> /driver-finance/…, route mounted) + Lead guard verify-settlements-subnav-stays-in-module |
| 130 | H | Settlements › Navigation › Liabilities | D011: Link targets `/liabilities` | Cursor | 443.257-D | CODED | 0512ef14cd 443.258-B (tab -> /driver-finance/…, route mounted) + Lead guard verify-settlements-subnav-stays-in-module |
| 131 | H | Settlements › Navigation › Escrow | D012: Link targets `/accounting/escrow` | Cursor | 443.257-D | CODED | 0512ef14cd 443.258-B (tab -> /driver-finance/…, route mounted) + Lead guard verify-settlements-subnav-stays-in-module |
| 132 | H | Settlements › Navigation › Pay Rate Templates | D013: Link targets `/drivers/pay-rate-templates` | Cursor | 443.257-D | CODED | 0512ef14cd 443.258-B (tab -> /driver-finance/…, route mounted) + Lead guard verify-settlements-subnav-stays-in-module |
| 133 | H | Settlements › Navigation › Deductions | D014: Link targets `/drivers/deductions` | Cursor | 443.257-D | CODED | 0512ef14cd 443.258-B (tab -> /driver-finance/…, route mounted) + Lead guard verify-settlements-subnav-stays-in-module |
| 134 | H | Settlements › List › Driver names | D015: All-uppercase names displayed | CC-1 / Cursor | 443.257-D | DONE-LIVE | settlements home proper case 10-23 5:12 PM |
| 135 | H | Fuel › Questions › Table | D016: No column chooser in rendered DOM | Cursor | 443.257-D | MERGED-UNVERIFIED | 0512ef14 |
| 136 | H | Fuel › Questions › Table headers | D017: Headers have no sorting controls | Cursor | 443.257-D | MERGED-UNVERIFIED | 0512ef14 |
| 137 | H | Fuel › Cards › Assign card drawer | D018: Six input controls measured 38px high | CC-3 | 443.257-D | OPEN | not re-verified since audit |
| 138 | H | Fuel › Cards › Driver options request | D019: `/api/v1/mdata/drivers` 4,522 ms in audit session | CC-2 | 443.257-D | OPEN | not re-verified since audit |
| 139 | H | Fuel › Expense mapping › Mapping request | D020: `/api/v1/accounting/expense-category-map` 8,831 ms | CC-1 | 443.257-D | OPEN | not re-verified since audit |
| 140 | H | Dispatch › Home › Round-trip exposure | D021: Driver names abbreviated to initials | Cursor | 443.257-D | RE-VERIFY | loads list shows full names 10-23 |
| 141 | H | Dispatch › Home › Return / idle / missing-bill tables | D022: Driver names all-uppercase | CC-3 | 443.257-D | OPEN | not re-verified since audit |
| 142 | H | Dispatch › Book Load › Stop fields | D023: Both ZIP controls measured 28px high × 381.33px wide | Cursor / CC-3 | 443.257-D | DONE-LIVE | #27294 ZIP 88px |
| 143 | H | Dispatch › Book Load › Presentation | D024: Long A–E form; no Side panel / Center toggle or five-step flow present | Cursor / CC-3 | 443.257-D | DONE-LIVE | Side panel / Center toggle live 10-23 5:19 PM |
| 144 | H | Dispatch › Load Costs › Pickup / delivery cells | D025: Dates display M/D/YY | Cursor | 443.257-D | OPEN | not re-verified since audit |
| 145 | H | Dispatch › Load Costs › Driver names | D026: All-uppercase names | CC-3 | 443.257-D | OPEN | not re-verified since audit |
| 146 | H | Dispatch › Load Costs › Settlement/Tour link | D027: Several links have only an em dash as label despite a settlement destination | CC-1 | 443.257-D | OPEN | not re-verified since audit |
| 147 | H | Tasks › Create Task › Inputs | D028: Eleven single-line inputs measured 38px high; textarea excluded | CC-3 | 443.257-D | OPEN | not re-verified since audit |
| 148 | H | Tasks › Exceptions › Since column | D029: ISO YYYY-MM-DD rendered | Cursor | 443.257-D | OPEN | not re-verified since audit |
| 149 | H | Driver Hub › Driver Scheduler › Date range | D030: Subtitle uses YYYY-MM-DD; grid uses MON-DD | Cursor | 443.257-D | OPEN | not re-verified since audit |
| 150 | H | Driver Hub › Driver Scheduler › Driver cells | D031: All-uppercase and inconsistent surname casing | CC-3 | 443.257-D | OPEN | not re-verified since audit |
| 151 | H | Driver Hub › Driver Scheduler › Assign Temp Cover | D032: Five single-line inputs measured 38px high; pickers about 2,477px wide and dates about 1,203px | CC-3 | 443.257-D | OPEN | not re-verified since audit |
| 152 | H | Maintenance › Home / Fleet Table › Money tiles | D033: MTD Cost, Open $ and severe-repair total omit cents | LEAD | 443.257-D | OPEN | not re-verified since audit |
| 153 | H | Maintenance › Create Work Order › Drawer inputs | D034: Visible single-line inputs measured 38px; customer picker about 2,408px wide, open-date input about 766px | CC-3 | 443.257-D | OPEN | not re-verified since audit |
| 154 | H | Maintenance › Active WOs › Table headers | D035: Load, Driver, Vendor, Bill, JE and Timing headers have no sorting button, unlike adjacent headers | LEAD | 443.257-D | OPEN | not re-verified since audit |
| 155 | H | Safety › Hours & Fatigue › Driver roster | D036: Mixed proper-case and all-uppercase driver names | CC-3 | 443.257-D | OPEN | not re-verified since audit |
| 156 | H | Safety › Hours & Fatigue › Create HOS Violation | D037: Seven visible inputs measured 38px high | CC-3 | 443.257-D | OPEN | not re-verified since audit |
| 157 | H | Compliance › Filings / Overview › Driver labels | D038: Mixed proper-case and uppercase driver labels in populated tables | CC-3 | 443.257-D | OPEN | not re-verified since audit |
| 158 | H | Driver Profile › Create Driver › Identity step | D039: Fifteen visible inputs measured 38px; CDL state about 199px wide | CC-3 | 443.257-D | OPEN | not re-verified since audit |
| 159 | H | Fleet › Create Trailer › Identity drawer | D040: Seven visible inputs measured 38px high | CC-3 | 443.257-D | OPEN | not re-verified since audit |
| 160 | H | Insurance › Policies › Create policy step 1 | D041: Eight visible inputs measured 38px high | CC-3 | 443.257-D | OPEN | not re-verified since audit |
| 161 | H | Cash Flow › Projected Auto › Seven-day outlook | D042: Currency abbreviated with k suffix and zero shown without cents | Cursor | 443.257-D | OPEN | still +15,386 no cents 10-23 5:10 PM |
| 162 | H | Cash Flow › Projected / Rolling / Manual › Date labels and cells | D043: Day labels and invoice/due cells omit year and use month names | Cursor | 443.257-D | OPEN | not re-verified since audit |
| 163 | H | Accounting › Home › Settlement / transaction links | D044: Driver/vendor names still all-uppercase | CC-3 | 443.257-D | OPEN | not re-verified since audit |
| 164 | H | Banking › Home › Drift alert as-of | D045: Raw ISO timestamp rendered, including T and Z | Cursor | 443.257-D | OPEN | not re-verified since audit |
| 165 | H | Banking › Home › Drift account label | D046: Several alerts show only generic Account rather than the account display name | CC-1 | 443.257-D | OPEN | not re-verified since audit |
| 166 | H | Factoring › Home › Ready-to-factor customers | D047: All-uppercase customer names displayed | CC-3 | 443.257-D | OPEN | not re-verified since audit |
| 167 | H | Customers › Create Customer › Billing address | D048: State and ZIP each measure 38px high and 209.33px wide | CC-3 | 443.257-D | OPEN | not re-verified since audit |
| 168 | H | Customers › Directory › Customer display names | D049: Mixed uppercase and proper-case customer labels | CC-3 | 443.257-D | OPEN | not re-verified since audit |
| 169 | H | Inventory › Create part › Unit cost | D050: Money input measures 28px high | CC-3 | 443.257-D | OPEN | not re-verified since audit |
| 170 | H | 425C › Profiles & Defaults › Company Name | D051: Input measures 30.67px high | CC-3 | 443.257-D | OPEN | not re-verified since audit |
| 171 | H | 425C › History › Filed timestamp | D052: Month/day rendered without zero padding | Cursor | 443.257-D | OPEN | not re-verified since audit |
| 172 | H | Lists › Names Master › Name column | D053: Mixed uppercase and proper-case customer names | CC-3 | 443.257-D | OPEN | not re-verified since audit |
| 173 | H | Reports › Custom report builder › Report name | D054: Input measures 26.67px high and 1156.38px wide | CC-3 | 443.257-D | OPEN | not re-verified since audit |
| 174 | H | Docs › All Entities › Entity names | D055: Mixed uppercase and proper-case driver names | CC-3 | 443.257-D | OPEN | not re-verified since audit |
| 175 | H | Docs › Upload Document › Category/entity/date inputs | D056: Four visible inputs 38px; date fields about 1201px wide | CC-3 | 443.257-D | OPEN | not re-verified since audit |
| 176 | H | Users › Master-detail › User labels | D057: Repeated generic User labels and mixed name capitalization | CC-3 | 443.257-D | OPEN | not re-verified since audit |
| 177 | H | Users › Create User › Name/email/role | D058: Three visible inputs 38px high | CC-3 | 443.257-D | OPEN | not re-verified since audit |
| 178 | H | Program › Scenario tracker › Certification timestamp | D059: Raw database timestamp with fractional seconds and +00 timezone | Cursor | 443.257-D | OPEN | not re-verified since audit |
| 179 | H | System › Transaction Health › Generated/document dates | D060: Month-name timestamps instead of MM/DD/YYYY | Cursor | 443.257-D | OPEN | not re-verified since audit |
| 180 | H | System › Transaction Health › Journal-entry and bill-payment labels | D061: Raw UUIDs are visible display labels | Cursor | 443.257-D | OPEN | not re-verified since audit |
| 181 | H | System › Transaction Health › Wiring preview DR/CR | D062: Currency values lack dollar signs | Cursor | 443.257-D | OPEN | not re-verified since audit |
| 182 | H | Reports › Scheduled subscriptions › Add subscription timezone | D063: Input measures 30.67px high | CC-3 | 443.257-D | OPEN | not re-verified since audit |
| 183 | H | Accounting › Create Manual JE › Step 2 Lines | D064: Header summary renders `Date: 2026-10-22`, while Step 1 correctly shows `10/22/2026` | Cursor | 443.257-D | OPEN | not re-verified since audit |
| 184 | H | Accounting › Create Manual JE › Step 2 Lines | D065: Class selector overlaps the adjacent Debit field; line controls overflow the drawer horizontally | Cursor | 443.257-D | OPEN | not re-verified since audit |
| 185 | H | Banking › Home / Record Transfer › Drawer footer | D066: Persistent alert stack renders above the open transfer drawer and obscures its bottom action area | Cursor | 443.257-D | OPEN | not re-verified since audit |
| 186 | H | Accounting › Bills / Bill detail › Payments on this bill | D067: Two linked payments render as `Payment — not visible` rather than distinct display identifiers | Cursor | 443.257-D | OPEN | not re-verified since audit |
| 187 | H | Accounting › Bill detail › Journal Entity column | D068: Five journal rows show raw UUID entity labels | Cursor | 443.257-D | OPEN | not re-verified since audit |
| 188 | H | Accounting › Reclassify › Account balance heading | D069: Date displays `10/23/26` while date filters use `10/23/2026` | Cursor | 443.257-D | OPEN | not re-verified since audit |
| 189 | H | Banking › Categorize / Match › Candidate dates | D070: Loaded candidate list displays YYYY-MM-DD dates while transaction header uses MM/DD/YYYY | Cursor | 443.257-D | OPEN | not re-verified since audit |
| 190 | H | Banking › Categorize / Match › Candidate payee labels | D071: Candidate names mix ALL CAPS and proper case | Cursor | 443.257-D | OPEN | not re-verified since audit |
| 191 | H | Banking › Relay card › Wallet balance tile | D072: Five-digit currency omits thousands separator | Cursor | 443.257-D | OPEN | not re-verified since audit |
| 192 | H | Cash Flow › Projected Auto › Expected Expenses driver labels | D073: Driver Bill labels mix ALL CAPS and proper case | Cursor | 443.257-D | OPEN | not re-verified since audit |
| 193 | H | Dispatch › Truck Line › Initial data requests | D074: Network capture: truck-line 11,425 ms; units-without-load 4,810 / 8,819 ms; positions/latest 4,193 ms; detention/board 3,217 ms | CC-3 | 443.257-D | PARTIAL | positions 168 ms / detention 203 ms (#27252); truck-line fc0a287e unverified |
| 194 | H | Settlements › Open Tours › PU / DEL dates | D075: Rendered dates use OCT-21 / OCT-23 rather than numeric month/day/four-digit year | Cursor | 443.257-D | OPEN | still OCT-21 on open tours 10-23 5:12 PM |
| 195 | H | Settlements › Escrow Accounts › Holder labels | D076: One visible holder link says Driver — Not Visible instead of a resolved full name | Cursor | 443.257-D | OPEN | still "Driver — Not Visible" 10-23 5:14 PM |
| 196 | H | Settlements › Escrow Accounts › Updated dates | D077: Date portion uses unpadded month/day before time | Cursor | 443.257-D | OPEN | still 9/28/2026 unpadded 10-23 5:14 PM |
| 197 | H | Maintenance › Road Service / Create Roadside WO › Ticket # and Location inputs | D078: Two single-line dialog text inputs measure 38 CSS px high | CC-3 | 443.257-D | OPEN | not re-verified since audit |
| 198 | H | Customers › Per-Customer P&L › Classification labels | D079: Visible tags read high_margin and past_due | CC-3 | 443.257-D | OPEN | not re-verified since audit |
| 199 | H | Coverage | Codex audit coverage is partial depth — remaining tabs, drawers and record pages of every module still to audit | LEAD | 443.281 | OPEN |  |
| 200 | F | Accounting | Accounting "Open invoices" KPI $624,076.72/165 vs GL A/R 1100 $621,076.72/164 (1 proforma $3,000.00 counted) | LEAD | 443.285 | CODED | #27452 eef79722 |
| 201 | E | Platform | 443.284 main static reds from 10-23 board merges block every push (7:40 PM: 2 fixed, 5 red) | CC-2 | 443.284 | CODED | 804f5f38c2 #27409 (CC-2) |
| 202 | E | Fuel | verify-no-internal-payload-in-notes red: dreamline-statement-import memo interpolates input.expenseId (afd3fd334e) | CC-2 | 443.284 | CODED | 804f5f38c2 memo + 5892782b30 structural link (CC-2) |
| 203 | F | Linkage | Linkage gate red (verify-every-load-born-posting-carries-its-load) blocks every money push | LEAD | 443.287 | PAUSED | AUTH-454 done; AUTH-453 198/241 on prod — owner: resume after all rows coded |
| 204 | F | Fuel | Statement card discount / difference is a separate expense with NO link to its receipt; copies the load once, never follows a move | CC-2 | 443.288-A | CODED | 5892782b30 #27432 443.288-A (CC-2); AUTH-457 ready for Lead |
| 205 | A | Expenses | OWNER: every expense-to-load assignment confirmed by dispatcher or closer — always | CC-2 | 443.288-B | CODED | e2048ed4b4 #27460 443.288-B (CC-2) |
| 206 | A | Dispatch / Settlements | Expense load confirmations queue (Dispatch + Settlements Close), multi-select, bulk confirm | Cursor | 443.288-C | CODED | 5f0c13e0af #27445 Cursor 443.288-C queue; bound to CC-2 engine e2048ed4b4 by Lead claude/lead-443-301-frontend-tsc |
| 207 | E | Guards | Guards for 443.288 (child follows parent, no machine-final load, close refuses proposed, family moves) | CC-2 | 443.288-D | OPEN |  |
| 208 | E | Platform | Main CI red at verify:arch-design (/insurance, Fuel Planner settings + Expense mapping) | LEAD | 443.289 | DONE | #27422 b1192f1e; plants red; CI re-run pending |
| 209 | E | Guards | 107 main static reds outside baseline split by seat | Cursor | 443.290 | IN PROGRESS | #27407 list; CC-1 #27413/#27416/#27417; Lead 4 Cash Flow in 443.283c |
| 210 | E | Platform | 6,266 guard scripts (488 live, ~5,700 source-text, 316 slate-color copies) | CC-2 | 443.291 | OPEN | after Codex filters PR |
| 211 | F | Cash Flow | Actual vs Projected + Manual reverted to pre-board code by #27390 | LEAD | 443.283c | CODED | #27453 d86e35ce |
| 212 | A | Settlements | Settlement number: P-number shown; real series not assigned by our system | CC-1 | 443.292-A | OPEN |  |
| 213 | A | Settlements | Tour dates wrong (P-0114 10/20→10/20; real 10/16→10/23) | CC-1 | 443.292-B | CODED | 7349992008 443.292-B tour period dates in Central time (CC-1) |
| 214 | A | Settlements | Settlements tab week list: closed show Open; duplicate empty driver rows | CC-1 | 443.292-C | CODED | 7349992008 443.292-C Settlement + Payment status columns (CC-1) |
| 215 | A | Settlements | Escrow register: all same date/source, no load numbers; escrow is per load | CC-1 | 443.292-D | OPEN |  |
| 216 | A | Accounting | Bill Payments shows driver escrows — not bill payments | CC-1 | 443.292-E | OPEN |  |
| 217 | A | Settlements | Empty closed settlements P-0123, P-0124 ($0, 0 lines) | CC-1 | 443.292-F | OPEN |  |
| 218 | A | Settlements | Statement must match the owner settlement document (5753 format): loads+stops+dates, fuel, expenses, per-load deductions, P&L | Cursor | 443.293-A | OPEN |  |
| 219 | A | Dispatch / Settlements | Settlement Close: what it does; should be a button in Dispatch | Cursor | 443.293-B | OPEN |  |
| 220 | A | Accounting | Inspect every Accounting tab; only Bills first tab is right | Cursor | 443.293-C | OPEN |  |
| 221 | A | All modules | Override: one reasons catalog + one button app-wide; owner/accountant confirm only; others dropdown; no typing | CC-3 | 443.294 | OPEN |  |
| 222 | A | All modules | Popup standard app-wide + Fuel assignment popup redesign | Cursor | 443.295 | OPEN | design PR #27439 |
| 223 | E | Fuel | Fuel evidence: odometer blank, "no GPS truck" while truck parked at pump | CC-2 | 443.296 | OPEN |  |
| 224 | A | Process | CODE-COMPLETE MODE: code every row, verify at the end | ALL | 443.297 | IN PROGRESS | box in docs/bus/lead/boxes/2026-10-23 |
