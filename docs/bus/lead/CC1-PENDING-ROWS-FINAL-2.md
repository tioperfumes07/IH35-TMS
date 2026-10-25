# CC-1 — 20 pending rows (measured 10-25 1:40 PM CT: register minus everything merged to main since 10-24 5:15 PM)

Work top to bottom. When a row is merged, change nothing here — the Lead re-measures from main.

| # | Area | Item | Round |
|---|---|---|---|
| 75 | Settlements | Settlement load-cost totals 25-50% below recount; P-0119/P-0113 $0 costs; GPS real miles 4,855 vs 1,110 | 443.278 |
| 79 | Cash Flow | Card payables not in forecast: Dreamline 2510 $187,894.21, WEX 2520 $29,156.88 | 443.277-B |
| 139 | Fuel › Expense mapping › Mapping request | D020: `/api/v1/accounting/expense-category-map` 8,831 ms | 443.257-D |
| 146 | Dispatch › Load Costs › Settlement/Tour link | D027: Several links have only an em dash as label despite a settlement destination | 443.257-D |
| 165 | Banking › Home › Drift account label | D046: Several alerts show only generic Account rather than the account display name | 443.257-D |
| 212 | Settlements | Settlement number: P-number shown; real series not assigned by our system | 443.292-A |
| 213 | Settlements | Tour dates wrong (P-0114 10/20→10/20; real 10/16→10/23) | 443.292-B |
| 214 | Settlements | Settlements tab week list: closed show Open; duplicate empty driver rows | 443.292-C |
| 215 | Settlements | Escrow register: all same date/source, no load numbers; escrow is per load | 443.292-D |
| 216 | Accounting | Bill Payments shows driver escrows — not bill payments | 443.292-E |
| 227 | Settlements | OWNER 10-24: P-0123/P-0124/P-0125 duplicates deleted completely + tour-close engine never opens a settlement for a settled load | 443.310 |
| 269 | Engine | ENG-34 920 guard-exempt entries (CI does not run them) — wire or delete, shrink-only | ENG |
| 271 | Reports | ENG-36 23 company settlements still negative after ENG-19 — measure each | ENG |
| 284 | Accounting | ENG-39 P0 vendor-balance view ≠ A/P GL by exactly the net pay of P-0113 (1,416.47) and P-0117 (329.51) — what the close owes vs what the view assumes | 443.328 |
| 285 | Settlements | ENG-40 P-0067 and P-0119 closed with no company settlement | 443.328 |
| 286 | Settlements | ENG-41 P-0121 cancelled but still reusable | 443.328 |
| 287 | Settlements | ENG-42 89 active duplicate settlement-line groups | 443.328 |
| 288 | Settlements | ENG-43 2 posted with zero load lines; P-0112/0116/0079/0114 $0 header; line ffac5c35 miles/rate NULL; closed-unposted with voided deduction | 443.328 |
| 290 | Drivers | ENG-45 2 settlement-active drivers without a Driver vendor (Carlos Mauricio Carvallo, Leonel Antonio Morales Noguez) — one profile per driver | 443.328 |
| 291 | Accounting | ENG-46 bill_payment ad02cc37 no source link; escrow sub-ledger 315,000¢ vs baseline 132,500¢; 5796/P-0102 USMCA settlement for a Transportation document | 443.328 |
