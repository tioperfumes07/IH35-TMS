# CC-2 — 28 pending rows (measured 10-25 1:40 PM CT: register minus everything merged to main since 10-24 5:15 PM)

Work top to bottom. When a row is merged, change nothing here — the Lead re-measures from main.

| # | Area | Item | Round |
|---|---|---|---|
| 6 | Driver/Fleet | Driver photo from uploaded IDs; unit photos | 443.252 |
| 16 | Settlements | A miles change at settlement re-prices the bills everywhere | 443.269-B |
| 21 | Accounting | QuickBooks unapplied credit: paid bill/invoice reduced below paid -> unapplied credit on payee | 443.270-C d |
| 22 | Banking | Relay: nothing stored under TRANSP; 10/09 fundings on TRANSP bank; deposit ingest stopped after 10-09; bank feed last 10-21 | 443.270-C e |
| 27 | Data | Delete USMCA test records (18 legal matters, 5 policies, 7 claims, 1 accident…) | 443.247 |
| 78 | Banking | 1090 Undeposited $170,210.48 (33 Faro advances never deposited) -> GL bank -$88,433.89 | 443.277-A/279 |
| 81 | HOS | 222,587 duty events on merged driver shells | 443.278 |
| 83 | Accounting | R2: 241 Dreamline statement discount JEs ($10,744.65) -> card-credit documents | 443.260 |
| 84 | Settlements | 5 settlement headers re-derive (P-0105/0107/0108/0109/0115); P-0115 carries two NBs incl. 13663 | 443.260 |
| 113 | Banking | 43 Plaid PENDING lines in October never replaced by their posted lines (e.g. SOUTH TX TRUCK CENTERS -460.01 pending 10-03 + posted 10-05) -> Banking Money in/out ($216,532.56 / $239,059.03) and Unexpected "possible duplicates" count them twice | 443.282 |
| 115 | Guards | verify-stops-are-geocoded red (13699) — live-data exception for CC-2 migration | 443.278/280/281 |
| 124 | Home › Overview › Driver summary request | D005: `/api/v1/telematics/driver-day-summary` 5,071 ms | 443.257-D |
| 138 | Fuel › Cards › Driver options request | D019: `/api/v1/mdata/drivers` 4,522 ms in audit session | 443.257-D |
| 201 | Platform | 443.284 main static reds from 10-23 board merges block every push (7:40 PM: 2 fixed, 5 red) | 443.284 |
| 202 | Fuel | verify-no-internal-payload-in-notes red: dreamline-statement-import memo interpolates input.expenseId (afd3fd334e) | 443.284 |
| 204 | Fuel | Statement card discount / difference is a separate expense with NO link to its receipt; copies the load once, never follows a move | 443.288-A |
| 205 | Expenses | OWNER: every expense-to-load assignment confirmed by dispatcher or closer — always | 443.288-B |
| 210 | Platform | 6,266 guard scripts (488 live, ~5,700 source-text, 316 slate-color copies) | 443.291 |
| 223 | Fuel | Fuel evidence: odometer blank, "no GPS truck" while truck parked at pump | 443.296 |
| 248 | Fuel | ENG-10 duplicate documents regressed 11 -> 36 groups (guard RED): 31 card-discount groups; 5 >= $1 (Relay 10-11 $623.75, Relay 09-23 $527.58, LOVES $15.25 x3) | 443.323 |
| 249 | Dispatch | ENG-11 G10: 10 loads with a stale 10-11 linehaul next to the 10-16 one — $30,170.00 revenue overstated in reports; rate change must replace, not add | 443.323 |
| 250 | Settlements | ENG-12 G14: all 105 deductions typed 'other'; fine + I-94 permit posted to 7200 admin-fee account | 443.323 |
| 251 | Dispatch | ENG-13 G1: 129 loads (10-11) with no trailer choice — back-fill from documents | 443.323 |
| 252 | Driver pay | ENG-14 G9: 1 of 209 driver bills without a unit | 443.323 |
| 253 | Accounting | ENG-15 maintenance bill writer must stamp linked_work_order_uuid + source | 443.323 |
| 254 | Accounting | ENG-16 Check Creator not commissioned: check_number_registry 0 rows (starting number from owner) | 443.323 |
| 255 | Accounting | ENG-17 1090 $170,210.48 / 2510 $187,894.21 residuals — tie document by document (rows 78, 79) | 443.323 |
| 256 | Engine | ENG-18 prepare-commit-msg hook (amend vs new commit) | 443.323 |
