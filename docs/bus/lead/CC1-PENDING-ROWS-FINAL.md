# CC-1 — every pending register row (source: docs/bus/lead/LEAD-PENDING-REGISTER.md on branch claude/lead-engine-register-2412, 10-24 05:15 PM CT) — 54 rows

| # | Area | Item | Round | Status at 5:15 PM |
|---|---|---|---|---|
| 28 | Reports | Load History tab + Settlement (driver/company), Loads, Customers, Vendors reports | 443.281 | OPEN |
| 66 | Reports/Dispatch | Dispatch › Load history (198 loads, every cell opens its record, load detail panel with timeline + money + linked records) | 443.281 | OPEN |
| 67 | Reports/Dispatch | Reports › Loads report (week/month/customer/driver/truck/lane/trip type) | 443.281 | OPEN |
| 68 | Reports/Dispatch | Reports › Driver settlement report (by settlement / driver, paid state) | 443.281 | OPEN |
| 69 | Reports/Dispatch | Reports › Company settlement report (profit per closed trip) | 443.281 | OPEN |
| 70 | Reports/Dispatch | Reports › Customer report (sales, open, aging, statement) | 443.281 | OPEN |
| 71 | Reports/Dispatch | Reports › Vendor report (spend, open bills, category, 1099) | 443.281 | OPEN |
| 72 | Reports/Dispatch | Reports home: add the 5 reports to the catalog; remove unrouted duplicates LoadHistoryPage.tsx / LoadsReportPage.tsx by replacing them with the board pages | 443.281 | OPEN |
| 73 | Driver pay | 3 delivered loads never accrued to A/P: 13663, 13687, 13688 ($2,056.34) | 443.279 | OPEN |
| 75 | Settlements | Settlement load-cost totals 25-50% below recount; P-0119/P-0113 $0 costs; GPS real miles 4,855 vs 1,110 | 443.278 | OPEN |
| 79 | Cash Flow | Card payables not in forecast: Dreamline 2510 $187,894.21, WEX 2520 $29,156.88 | 443.277-B | OPEN |
| 82 | Accounting | Rafael salary bill P-0069 / 13530 $300 unpaid since 08-21, due_date NULL | 443.279 | OPEN |
| 85 | Vendors | All 30 vendors have no category | 443.281 | OPEN |
| 86 | Settlements | 3 recent closed settlements have no number / company settlement not opened (P-0119, P-0113, P-0117) | 443.281 | OPEN |
| 89 | Cash Flow | Three different opening-cash figures: Home $25,533.37, Manual bank total $102,867.17, Manual opening $0.00 | 443.281 | CODED |
| 90 | Cash Flow | Manual "bank balances" counts card payables and Faro as cash: Dreamline -$140,226.34 (GL 2510 -$187,894.21), WEX +$29,156.88 (a payable shown positive), Faro Factoring $175,650.00 | 443.281 | CODED |
| 93 | Accounting | Open bills $126,443.92 / 179 vs A/P subledger $126,437.22 / 177 (diff $6.70, 2 bills) | 443.281 | OPEN |
| 94 | Accounting | Open invoices header $624,076.72 / 165 vs aging $621,076.72 / 164 (proforma 169-13690 $3,000 counted in header) | 443.281 | CODED |
| 95 | Accounting | Cash pulse Oct: IN $0.00 / OUT $1,590.00 while Banking shows money in $216,532.56 / out $239,059.03 | 443.281 | OPEN |
| 101 | Vendors | 86 possible duplicate vendors; Open bills $126,443.92 includes driver bills; Spend YTD $351,241.23 vs expenses $353,241.23 | 443.281 | OPEN |
| 139 | Fuel › Expense mapping › Mapping request | D020: `/api/v1/accounting/expense-category-map` 8,831 ms | 443.257-D | OPEN |
| 146 | Dispatch › Load Costs › Settlement/Tour link | D027: Several links have only an em dash as label despite a settlement destination | 443.257-D | OPEN |
| 165 | Banking › Home › Drift account label | D046: Several alerts show only generic Account rather than the account display name | 443.257-D | OPEN |
| 212 | Settlements | Settlement number: P-number shown; real series not assigned by our system | 443.292-A | CODED |
| 213 | Settlements | Tour dates wrong (P-0114 10/20→10/20; real 10/16→10/23) | 443.292-B | CODED |
| 214 | Settlements | Settlements tab week list: closed show Open; duplicate empty driver rows | 443.292-C | CODED |
| 215 | Settlements | Escrow register: all same date/source, no load numbers; escrow is per load | 443.292-D | PARTIAL |
| 216 | Accounting | Bill Payments shows driver escrows — not bill payments | 443.292-E | OPEN |
| 217 | Settlements | Empty closed settlements P-0123, P-0124 ($0, 0 lines) | 443.292-F | OPEN |
| 227 | Settlements | OWNER 10-24: P-0123/P-0124/P-0125 duplicates deleted completely + tour-close engine never opens a settlement for a settled load | 443.310 | INPROGRESS |
| 239 | Settlements | ENG-01 P-0113/P-0117/P-0119 closed but never posted (posted_at NULL, 0 postings); ledger ratchet 1 -> live 3; blocks #27478. DB refusal: no close without posting | 443.322 | OPEN |
| 240 | Driver pay | ENG-02 driver_pay_cents reads the accrued A/P bill, not driver_bills.gross (13574 $1,538.81 vs $957.55) | 443.322 | OPEN |
| 241 | Settlements | ENG-03 escrow_ledger 58 rows, 0 with load_id — writer stamps the load; back-fill | 443.322 | OPEN |
| 242 | Accounting | ENG-04 2170 Driver Net-Pay Clearing Cr $2,575.96 / 12 postings — tie to open net pay, clear through documents | 443.322 | OPEN |
| 243 | Engine | ENG-05 swallowed DB errors grew 122 -> 125 — fix the 3 new, baseline back to 122 | 443.322 | OPEN |
| 244 | Engine | ENG-06 two overlapping spine guards (-has-a- / -has-its-, step claimed twice) — merge | 443.322 | OPEN |
| 245 | Dispatch | ENG-07 G11: 8 of 410 stops without geocode precision since 10-13; Book/Edit Load must refuse a city-only stop | 443.322 | OPEN |
| 246 | Driver pay | ENG-08 G15: prod check every lumper advance since 0f1f83233e posts as the load's lumper expense | 443.322 | OPEN |
| 247 | Engine | ENG-09 THE GUARANTEE: verify-engine-register-closed-by-guard — a register row is DONE only with a wired guard + evidence; wired in step 1 | 443.322 | OPEN |
| 269 | Engine | ENG-34 920 guard-exempt entries (CI does not run them) — wire or delete, shrink-only | ENG | OPEN |
| 270 | Engine | ENG-35 re-run the full live engine-guard set (10-03: 119 failing) and list reds | ENG | OPEN |
| 271 | Reports | ENG-36 23 company settlements still negative after ENG-19 — measure each | ENG | OPEN |
| 283 | Settlements | ENG-01c P-0119 settlement line deduction $10.00 has no driver_settlement_deductions row — writer + back-fill; ENG-01b refusal proven on fork | 443.322 | OPEN |
| 284 | Accounting | ENG-39 P0 vendor-balance view ≠ A/P GL by exactly the net pay of P-0113 (1,416.47) and P-0117 (329.51) — what the close owes vs what the view assumes | 443.328 | OPEN |
| 285 | Settlements | ENG-40 P-0067 and P-0119 closed with no company settlement | 443.328 | OPEN |
| 286 | Settlements | ENG-41 P-0121 cancelled but still reusable | 443.328 | OPEN |
| 287 | Settlements | ENG-42 89 active duplicate settlement-line groups | 443.328 | OPEN |
| 288 | Settlements | ENG-43 2 posted with zero load lines; P-0112/0116/0079/0114 $0 header; line ffac5c35 miles/rate NULL; closed-unposted with voided deduction | 443.328 | OPEN |
| 289 | Driver pay | ENG-44 bill 13697 due date; salaried stray bill not voided; presettlement autolink 13556/13563; live_load_number self-referential 13694/13695 | 443.328 | OPEN |
| 290 | Drivers | ENG-45 2 settlement-active drivers without a Driver vendor (Carlos Mauricio Carvallo, Leonel Antonio Morales Noguez) — one profile per driver | 443.328 | OPEN |
| 291 | Accounting | ENG-46 bill_payment ad02cc37 no source link; escrow sub-ledger 315,000¢ vs baseline 132,500¢; 5796/P-0102 USMCA settlement for a Transportation document | 443.328 | OPEN |
| 292 | Engine | ENG-47 guards stale vs owner rulings: TIO PERFUMES kept; voids are design; S-13655/56; unbilled revenue migration; 'USMCA hidden'; archive tables RLS | 443.328 | OPEN |
| 309 | Legal | ENG-60 retire the insurance.lawsuit side table: PolicyDetail lawsuit section → legal matters by claim, claim.lawsuit_id → legal matter, LawsuitsTab + 17 guards that read it; drop table after 0 rows all entities | ENG-60 | OPEN |
| 310 | Settlements | ENG-61 closeLoadBookendedSettlementForDriver (settlement ping on final-load delivery) sets closed without posting — refused by tg_settlement_close_requires_posting (ACCT-ENG-01); the close-on-final-load path must post (postLoadBookendedSettlementGlAfterClose) or leave it open | ENG-61 | OPEN |
