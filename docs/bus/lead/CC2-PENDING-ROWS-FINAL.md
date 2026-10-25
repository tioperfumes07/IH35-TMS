# CC-2 — every pending register row (source: docs/bus/lead/LEAD-PENDING-REGISTER.md on branch claude/lead-engine-register-2412, 10-24 05:15 PM CT) — 46 rows

| # | Area | Item | Round | Status at 5:15 PM |
|---|---|---|---|---|
| 6 | Driver/Fleet | Driver photo from uploaded IDs; unit photos | 443.252 | OPEN |
| 16 | Settlements | A miles change at settlement re-prices the bills everywhere | 443.269-B | CODED |
| 21 | Accounting | QuickBooks unapplied credit: paid bill/invoice reduced below paid -> unapplied credit on payee | 443.270-C d | OPEN |
| 22 | Banking | Relay: nothing stored under TRANSP; 10/09 fundings on TRANSP bank; deposit ingest stopped after 10-09; bank feed last 10-21 | 443.270-C e | OPEN |
| 27 | Data | Delete USMCA test records (18 legal matters, 5 policies, 7 claims, 1 accident…) | 443.247 | CODED |
| 76 | Settlements | 0 of 85 closed settlements marked paid ($127,897.75) | 443.281 | OPEN |
| 77 | A/R | 0 customer payments / Faro purchases applied: all $621,076.72 open incl. 57 advanced invoices | 443.279 | OPEN |
| 78 | Banking | 1090 Undeposited $170,210.48 (33 Faro advances never deposited) -> GL bank -$88,433.89 | 443.277-A/279 | OPEN |
| 81 | HOS | 222,587 duty events on merged driver shells | 443.278 | OPEN |
| 83 | Accounting | R2: 241 Dreamline statement discount JEs ($10,744.65) -> card-credit documents | 443.260 | PARTIAL |
| 84 | Settlements | 5 settlement headers re-derive (P-0105/0107/0108/0109/0115); P-0115 carries two NBs incl. 13663 | 443.260 | CODED |
| 97 | Banking | Reconciliation drift: BofA bank $1,808.13 vs book -$88,433.89 (diff $90,242.02); Relay Fuel Wallet listed twice | 443.281 | OPEN |
| 99 | Unexpected | Possible duplicates 0 while bank lines repeat (460.01 on 10-03 and 10-05; 155.86 twice on 10-07) | 443.281 | OPEN |
| 104 | Fuel | Cards: 0 card assignments; Relay issuer blank | 443.281 | OPEN |
| 105 | Fuel | Relay unmatched 257 fills (truck matched, driver never matched) | 443.281 | OPEN |
| 106 | Fuel | History & savings / Compliance: every value "Not available"; Loves prices never synced | 443.281 | OPEN |
| 107 | Fuel | Home MTD spend $91,539 vs Fuel board figure; Avg $/gal $5.44 | 443.281 | OPEN |
| 108 | Maintenance | All 43 trucks "PM reading unavailable"; 0 work orders; MTD cost $0.00 | 443.281 | OPEN |
| 110 | Driver Profile | Angel Sosa: "No current truck assignment" while on T156 (13697); documents all "Not recorded" | 443.281 | OPEN |
| 111 | Insurance | Insurance page renders inside the Safety header/tab shell | 443.281 | CODED |
| 112 | Legal | Open matters 0 on page while legal.matters holds 18 rows (test records) | 443.281 | OPEN |
| 113 | Banking | 43 Plaid PENDING lines in October never replaced by their posted lines (e.g. SOUTH TX TRUCK CENTERS -460.01 pending 10-03 + posted 10-05) -> Banking Money in/out ($216,532.56 / $239,059.03) and Unexpected "possible duplicates" count them twice | 443.282 | OPEN |
| 115 | Guards | verify-stops-are-geocoded red (13699) — live-data exception for CC-2 migration | 443.278/280/281 | OPEN |
| 124 | Home › Overview › Driver summary request | D005: `/api/v1/telematics/driver-day-summary` 5,071 ms | 443.257-D | OPEN |
| 138 | Fuel › Cards › Driver options request | D019: `/api/v1/mdata/drivers` 4,522 ms in audit session | 443.257-D | OPEN |
| 201 | Platform | 443.284 main static reds from 10-23 board merges block every push (7:40 PM: 2 fixed, 5 red) | 443.284 | CODED |
| 202 | Fuel | verify-no-internal-payload-in-notes red: dreamline-statement-import memo interpolates input.expenseId (afd3fd334e) | 443.284 | CODED |
| 204 | Fuel | Statement card discount / difference is a separate expense with NO link to its receipt; copies the load once, never follows a move | 443.288-A | CODED |
| 205 | Expenses | OWNER: every expense-to-load assignment confirmed by dispatcher or closer — always | 443.288-B | CODED |
| 207 | Guards | Guards for 443.288 (child follows parent, no machine-final load, close refuses proposed, family moves) | 443.288-D | OPEN |
| 210 | Platform | 6,266 guard scripts (488 live, ~5,700 source-text, 316 slate-color copies) | 443.291 | OPEN |
| 223 | Fuel | Fuel evidence: odometer blank, "no GPS truck" while truck parked at pump | 443.296 | OPEN |
| 248 | Fuel | ENG-10 duplicate documents regressed 11 -> 36 groups (guard RED): 31 card-discount groups; 5 >= $1 (Relay 10-11 $623.75, Relay 09-23 $527.58, LOVES $15.25 x3) | 443.323 | OPEN |
| 249 | Dispatch | ENG-11 G10: 10 loads with a stale 10-11 linehaul next to the 10-16 one — $30,170.00 revenue overstated in reports; rate change must replace, not add | 443.323 | OPEN |
| 250 | Settlements | ENG-12 G14: all 105 deductions typed 'other'; fine + I-94 permit posted to 7200 admin-fee account | 443.323 | OPEN |
| 251 | Dispatch | ENG-13 G1: 129 loads (10-11) with no trailer choice — back-fill from documents | 443.323 | OPEN |
| 252 | Driver pay | ENG-14 G9: 1 of 209 driver bills without a unit | 443.323 | OPEN |
| 253 | Accounting | ENG-15 maintenance bill writer must stamp linked_work_order_uuid + source | 443.323 | OPEN |
| 254 | Accounting | ENG-16 Check Creator not commissioned: check_number_registry 0 rows (starting number from owner) | 443.323 | OPEN |
| 255 | Accounting | ENG-17 1090 $170,210.48 / 2510 $187,894.21 residuals — tie document by document (rows 78, 79) | 443.323 | OPEN |
| 256 | Engine | ENG-18 prepare-commit-msg hook (amend vs new commit) | 443.323 | OPEN |
| 293 | Fuel | ENG-48 fuel-expense one-to-one (13563-1 JE 0¢ + 14 loads); same-day duplicate fill pairs; traceability shrink fc461eb6; literal account '5000' in statement-card-credit-repair | 443.329 | OPEN |
| 294 | Settlements | ENG-49 settlement 5787 non-diesel expenses $235.01 vs signed $140.20 | 443.329 | OPEN |
| 295 | Factoring | ENG-50 invoice amount_paid vs applications (9-13515 $525, 7 $350); book = Faro = AlwaysTrack 12 issues; factoring-advance-links-its-load selftest | 443.329 | OPEN |
| 296 | Banking | ENG-51 944 composite-memo rows unbackfilled; 1 Creator load miles without source | 443.329 | OPEN |
| 297 | Accounting | ENG-52 load-costs-board revenue not from loadCostRollupLateral (one source) | 443.329 | OPEN |
