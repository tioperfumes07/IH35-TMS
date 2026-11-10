# PENDING WORK — NUMBERED — 2026-11-02 4:50 PM CT

Sources: docs/bus/lead/LEAD-PENDING-REGISTER.md (last written 10-28, rows NOT re-measured since) + docs/bus/lead/ENGINE-REGISTER.json (11-02 17:12Z) + items measured today. Every non-DONE row is listed. CODED / MERGED-UNVERIFIED = code exists, live proof missing.

## 11-04 12:00 CT

- ACCT-F11100 banking cleared-only tiles: PR #28656 open, not merged.
  - USMCA FREIGHT money out, old reader → new reader: Oct $285,153.62 → $284,129.85; Nov 1–4 $41,194.89 → $19,199.76 (9 pending lines shown separately: out $21,995.13, in $4,076.00).
  - 2 stale pending rows voided and linked (audits ff22835a-3c39-46c0-89ce-41977fd1812f, d7ff5539-a206-430e-a4be-eed78a02a339).
  - Waits on #28661.
- ACCT-F11101/F11102: MERGED #28657 (33c2dc65).
  - Credit memo corrects sent invoices.
  - Bill 13693 repriced $979.45 → $940.27, audit 88278135-be70-49de-b00f-a8427ebf4727.
  - TB 0 → 0. A/P 2000 unchanged (the bill was never accrued).
- ACCT-F11103: MERGED #28655 (d0d20344) and #28660 (2811ac7a), claim #28658.
  - #28655 counted payment-less applications with no live source; #28660 is the root fix.
  - A/R aging = A/R 1100 = $621,076.72 (78 customers).
- ACCT-F11104: MERGED #28659 (3493aeb8), read-only QBO bill-payment evidence page.
  - Groups vs the 08-15 mirror: 11 exact $5,128.42 / 1 ambiguous $543.76 / 179 none $128,863.46 / postable 0.
  - QBO checks 1525/1526/1527/1529 have no USMCA bank debit; drivers were paid via Zelle through Alberto or from the Transportation bank.
  - The mirror pull has been blocked since 09-28 (flag in catalogs.blocked_feature_flags).
  - OWNER/ACCOUNTANT: how to record Alberto- or Transportation-paid driver payouts.
- ACCT-F11105 fuel live guards: PR #28661 open. All checks green except verify-additive-only (owner-gated).
  - Root cause: the ENG-65 first run at 11-04 12:00Z recorded Relay fills already on DREAMLINE tickets on other trucks.
  - 18 fuel rows voided, $5,112.14, 0 GL, 18 audit events.
  - OWNER: void DREAMLINE ($5,800.15) or Relay ($5,138.14) expense docs for the 13 double-booked purchases; 12 more matching fills; T176 Mandeville 09-11 near-pair; load 13569 attribution of Aug 4–5 rows.
- Main-side reds consolidated into #28661 (via #28662): stale battery doc, customer-detail proper-case test, savepoints teardown, 5 board-guard selftests, *_ack_at rename, is_credit in the QBO evidence service, floor-override guard, navy hex.
- OWNER: verify-additive-only 70→78. It needs an OWNER-REMOVE line for 8 gear-hidden columns (TripPairing ×3, CompanySettlements ×2, Deductions Started ×2, Insurance Expires).
- Still owner-side: void bills 13544 $3.46 / 13563 $3.24; Relay CSV upload; advances CA-0001..0012 on hold (accountant).

## Lead re-measure 2026-11-02 5:00 PM CT

20 Lead rows proved DONE-LIVE (15, 31, 32, 36, 39, 40, 41, 42, 106, 107, 108, 118, 135, 136, 147, 170, 171, 178, 209, 211); row 44 PARTIAL. Also found: migration 202615210200 (complete delete route) is not in the prod migrations ledger, but every object it creates is present in prod (purge_authorized_rows, audit.record_deletions, loads.source_entity_code, delete_cancelled_load_revrec).

## NEW pending found 11-02 (Lead, measured)

| # | Area | Item | Seat | Status |
|---|---|---|---|---|
| 257 | Tests | Backend vitest on main e27c5b2c8: 35 test files / 46 tests FAIL (posting-engine cash/driver advance, revrec interlock, fuel poster class, migration tests 0242/qbo/samsara/reconciliation, dispatch book-load, customer routes…) — identical with and without #27965 | CC-1 (accounting) / CC-2 (dispatch, mdata) / CC-3 (migrations) | PARTIAL — #28643 (open, OWNER merge): CI heavy 41 → 1 failing (8,121 pass); 3 prod defects fixed (view security_invoker, payment_id nullable parity, fuel vendor case); 38 stale fixtures updated; last: CHAIN-06 factored invoice status after customer payment → OWNER decision |
| 258 | Fleet data | 9 phantom units from Samsara: 6 SAM-xxxxxxxx (VIN SAMVIN-…, 3 USMCA-leased, 3 TRANSP) + 3 gateway-serial units G497-J2K-EKM / G77P-YAB-4V7 / GPRR-ZPF-HEC (TRK); 0 loads, fuel, WOs, expenses, bills; 3 GPS pings 06/2019 — purge (Lead recommends DELETE via AUTH purge route) | CC-2 | DONE-LIVE — 11-03 18:25Z prod: SAM- units 0 in every entity (owned/leased/any), gateway-serial G… units 0 |
| 263 | Drivers | 165 USMCA driver rows = 93 people: 65 exact-name groups / 72 extra rows from a double roster import (07-04 + 08-21); merge all into one survivor each (33 hard-id, 47 owner-confirmed per owner order 6:29 PM CT, 1 conflicting CDL pair held), near-duplicate sets to owner queue, importers resolve-before-insert + unique hard-id indexes | CC-1 | PARTIAL — 165 rows → 85 unmerged (80 merged), exact-name groups 0; #28252 ask-before-create engine live; placeholder-phone fix patch with CC-1; importer resolve-before-insert + hard-id indexes open (CC-1) |
| 261 | Cash Flow | Actual vs Projected projects $0 expenses every day (actual $52,955.83 out 10/26–11/02): AvP reads bills-only (0 bills due) and the snapshot stores income only — expense must come from the daily engine + snapshot column | CC-1 | PARTIAL — migration 202616320100 live; first expense snapshot 11-04 06:10 CT; projected expense $0 because every open obligation is past due (191 bills $134,535.64 · 183 driver bills $132,340.51 · 90 settlements $134,675.96). OWNER: carry overdue onto today? |
| 260 | Dispatch | 13692/13693/13695 delivered to Edison (GPS) but never stamped — delivery stop geocode 'range' 0.7 mi off the dock; $14,700 not invoiced; USMCA range 22 stops → 5 unstamped, NULL 8 → 8 unstamped, rooftop 373 → 0 (docs/bus/lead/11-02-2026-Claude-Lead-FINDING-RANGE-GEOCODE-MISSED-DELIVERIES-14700.md) | CC-2 | DONE-LIVE — 11-03 16:40Z prod: 13692/13693/13695 delivered_pending_docs; open stops on them 0 |
| 259 | Maintenance | Fleet health showed the SAM- phantoms — fixed #28191 e27c5b2c8 | LEAD | DONE-LIVE — live /maintenance 23:35Z: "All 39", 0 SAM- units |

## Lead 11-04 01:30Z (7:30 PM CT) checkpoint

Rows 93, 94, 127, 130 DONE-LIVE (prod numbers in each row). 131, 116, 124 PARTIAL. Main made green: #28624 (5 orphan guards wired, verify-guard-wired 0), #28626 (frontend tsc 13 errors → 0; Termination Reasons modal crashed on SelectCombobox), #28628 (3 stale derived artifacts). #28627 deadhead overlap refusal. #28625 (live-fails pass 2): load-costs board 35,979 ms → 302 ms on prod SQL; Period 2001 fixed (pgDateOnly, 22 sites); diesel-by-truck page 200; CDL/date-only display (62 calls); revenue alias fix +$33,750 booked revenue on 8 un-invoiced loads (13688 13690 13692–13695 13698 13700) — deployed endpoint check pending.

## Lead 11-04 02:40Z (8:40 PM CT)

Main green: #28632 (phantom guard reads migration functions; 14px→12px; battery doc without line numbers), #28635 (locked-guards-heavy: 3 stale pins + Relay external id). Rows 152/261/11/12/87/88 measured — see rows. PRs #28633 + #28634 blocked from builder self-merge (merge-without-review) → OWNER merge.

## Lead 11-04 05:05Z (11:05 PM CT)

Main-green tonight: #28624 #28626 #28628 #28632 #28635 #28637 #28638 #28639 #28644 #28645 #28646. OWNER merges waiting: #28633 (Relay CSV), #28634 (settlement paid), #28643 (heavy CI 41→1), Dependabot #28216 #27892 #28218 (0 new failures vs main). Prod 05:02Z: E11 84 real-miles loads; E9 598 unresolved fills (sweep at 06:00 CT); bills 13544/13563 still open (void button live).

## Lead 11-04 12:15Z (6:15 AM CT) — after the 06:00 CT jobs

E1 DONE-LIVE: 365 Relay fills, 0 without a driver (261 matched this run). ENG-65: 90 → 3 named. Row 85: $5,319.11 accrued exactly. E8: 11-04 snapshot stores projected_expense_cents (0 — every open obligation is overdue; row 261 owner question). E9: 22 resolved; #28648 fixes the sweep running for frozen Transportation (1,631 questions opened there). E11 84 real-miles loads (unchanged). Bills 13544/13563 still open.

## Counts by category

| Category | Pending |
|---|---|
| A · Owner asks | 44 |
| B · Board design (layered / chrome-only) | 33 |
| C · Reports & Load history builds | 7 |
| E · Money defects (engines) | 21 |
| ENG · Engine register | 42 |
| F · Live findings (tie-outs) | 26 |
| G · Guards red | 6 |
| H · Screen label / data defects | 77 |
| **TOTAL** | **256** |

## Counts by status

| Status | Count |
|---|---|
| OPEN | 118 |
| CODED | 63 |
| MERGED-UNVERIFIED | 26 |
| PARTIAL | 23 |
| CODED-QUEUED | 18 |
| IN PROGRESS | 2 |
| INPROGRESS | 2 |
| BLOCKED | 1 |
| MERGED | 1 |
| PAUSED | 1 |
| RE-VERIFY | 1 |

## Counts by seat

| Seat | Count |
|---|---|
| CURSOR | 72 |
| CC-3 | 54 |
| CC-2 | 40 |
| CC-1 | 38 |
| LEAD | 34 |
| - | 9 |
| OWNER | 7 |
| ALL | 1 |
| CODEX | 1 |

## A · Owner asks

| # | Src | Area | Item | Seat | Status |
|---|---|---|---|---|---|
| 1 | R3 | Dispatch | Kanban: truck cards drag to assign/book/availability | LEAD | MERGED-UNVERIFIED |
| 2 | R5 | All | Names proper-case automatically (people), org casing kept (ACME) | CC-3 | PARTIAL |
| 3 | R6 | Driver/Fleet | Driver photo from uploaded IDs; unit photos | CC-2 | MERGED — #28610; live UI proof pending |
| 4 | R8 | Settlements | Navigation defects N1-N10 (tabs leave module, escrow dupes, $2575.96, initials) | Cursor | MERGED-UNVERIFIED — D007-D014 SETTLEMENTS_SUBNAV in-module; residual money/initials live UNVERIFIED |
| 5 | R9 | Dispatch | Truck Line status opens searchable dropdown | Cursor | MERGED-UNVERIFIED |
| 6 | R12 | Fuel | Fuel Questions Review crash (load_number undefined) | CC-2 | MERGED-UNVERIFIED |
| 7 | R15 | Settlements | Pre-Settlements: Load #, Entries, Ready-to-close, Close, clickable, responsive, miles DB+Google | CC-3 | MERGED-UNVERIFIED |
| 8 | R16 | Settlements | A miles change at settlement re-prices the bills everywhere | CC-2 | CODED |
| 9 | R18 | Design | Every board implemented exactly (no layering) | CC-3 | OPEN |
| 10 | R19 | Data | One canonical source per entity across all views of the same type | CC-3 | BLOCKED |
| 11 | R21 | Accounting | QuickBooks unapplied credit: paid bill/invoice reduced below paid -> unapplied credit on payee | CC-2 | OPEN (feature) — prod 0 of 193 bills / 0 of 193 invoices overpaid; edits on paid bills / sent invoices are refused today. Build = edit path + reverse/repost + payment reduction; the credit must be a no-GL record. OWNER: factored invoices editable after send? |
| 12 | R22 | Banking | Relay: nothing stored under TRANSP; 10/09 fundings on TRANSP bank; deposit ingest stopped after 10-09; bank feed last 10-21 | CC-2 | PARTIAL — fuel pull green daily through 11-03 (last USMCA fill 10-29); USMCA bank feed current 11-03; deposits stopped 10-09 because the portal CSV import had no UI → PR #28633 (upload panel) awaits OWNER merge; then OWNER uploads Relay CSV 10-09..today; ask Mike Masteller: deposit API? webhook headers (55 deliveries rejected missing_headers) |
| 13 | R27 | Data | Delete USMCA test records (18 legal matters, 5 policies, 7 claims, 1 accident…) | CC-2 | CODED |
| 14 | R28 | Reports | Load History tab + Settlement (driver/company), Loads, Customers, Vendors reports | CC-1 | OPEN |
| 15 | R29 | All | LAW 5:08 PM: every selector is multi-select (units, loads, settlements, trucks, trailers, drivers, customers, vendors…) everywhere | LEAD | DONE-LIVE — verify-entity-filters-multi-select PASS on main 23:00Z: 134 entity filters detected, 134 multi-select, 0 failed |
| 16 | R114 | Process | Cursor confirmation of 443.282 (owner-authorized build exactly as specified) | Cursor | MERGED-UNVERIFIED — verify-factoring-layout-tabs-first 443.282 board-exact PASS; live owner confirm UNVERIFIED |
| 17 | R205 | Expenses | OWNER: every expense-to-load assignment confirmed by dispatcher or closer — always | CC-2 | CODED |
| 18 | R206 | Dispatch / Settlements | Expense load confirmations queue (Dispatch + Settlements Close), multi-select, bulk confirm | Cursor | MERGED-UNVERIFIED — ExpenseLoadConfirmationsBoard MultiSelect + bulk confirm; live UNVERIFIED |
| 19 | R212 | Settlements | Settlement number: P-number shown; real series not assigned by our system | CC-1 | CODED |
| 20 | R213 | Settlements | Tour dates wrong (P-0114 10/20→10/20; real 10/16→10/23) | CC-1 | CODED |
| 21 | R214 | Settlements | Settlements tab week list: closed show Open; duplicate empty driver rows | CC-1 | CODED |
| 22 | R215 | Settlements | Escrow register: all same date/source, no load numbers; escrow is per load | CC-1 | DONE-LIVE (data) — #28642 + prod backfill: 62 escrow postings → 138 per-load rows (accounting.escrow_posting_loads), 0 without a load, $3,450.00 total; register dates = document date; open: 53 per-load settlement lines voided by SET-24 LINE-DUP (OWNER: un-void?), company-wide Escrow tab still dates by keyed time, screen not yet seen live |
| 23 | R216 | Accounting | Bill Payments shows driver escrows — not bill payments | CC-1 | MERGED-UNVERIFIED — #28576: one A/P bill-payment scope; vendor/driver Bill payments tab 223 settlement deductions → 0; main list already 0 active; escrow pages unchanged |
| 24 | R217 | Settlements | Empty closed settlements P-0123, P-0124 ($0, 0 lines) | CC-1 | DONE-LIVE — #28583 + prod 23:35Z: P-0123/P-0124 no longer exist (owner deleted 10-24, row 33); close refusal now counts only live lines (active AND not voided); remaining $0 closed = P-0067/P-0122 Rafael weekly salary (owner ruled) |
| 25 | R218 | Settlements | Statement must match the owner settlement document (5753 format): loads+stops+dates, fuel, expenses, per-load deductions, P&L | Cursor | MERGED-UNVERIFIED — SettlementStatementWorkflow + BoardPanels + LinkedRecords + FuelPurchases; live 5753 compare UNVERIFIED |
| 26 | R219 | Dispatch / Settlements | Settlement Close: what it does; should be a button in Dispatch | Cursor | MERGED-UNVERIFIED — SettlementCloseArrivalPage + Dispatch Pre-Settlement/LoadDetail CTA; live UNVERIFIED |
| 27 | R220 | Accounting | Inspect every Accounting tab; only Bills first tab is right | Cursor | MERGED-UNVERIFIED — #28518–#28543 + #28566 CreateMultipleBills/VendorBillCreate BoardSection need-company (~69 Accounting surfaces; Reclassify/match/LoadCosts skipped); fill-shell PASS; live tab inspect UNVERIFIED |
| 28 | R221 | All modules | Override: one reasons catalog + one button app-wide; owner/accountant confirm only; others dropdown; no typing | CC-3 | MERGED — #28621 (migration 202616350100 applied 00:36:59Z); live UI proof pending |
| 29 | R222 | All modules | Popup standard app-wide + Fuel assignment popup redesign | Cursor | MERGED-UNVERIFIED — verify-popups-one-format overlays=0; FuelAssignmentPopup sizePreset md 720 (443.295); verify-fuel-assignment-popup PASS; live owner walk UNVERIFIED |
| 30 | R224 | Process | CODE-COMPLETE MODE: code every row, verify at the end | ALL | IN PROGRESS |
| 31 | R225 | Gates | Main pre-push gate red for every seat (filter-panel regex, selftest-mutates, export-business-date) | LEAD | DONE-LIVE — verify-export-business-date / verify-no-selftest-mutates-tracked-source / verify-program-system-cashflow-filter-panels PASS on main 22:58Z |
| 32 | R226 | Gates | Main pre-push gate red: 10 unwired guards, row-218 panel leaf, 2 stale guards | LEAD | DONE-LIVE — verify-cc1-money-orphan-guard-registry-batch PASS (85 guards in CI, orphan census 0); step 18937 (31 guards) merged #28096 7f6d72bfc |
| 33 | R227 | Settlements | OWNER 10-24: P-0123/P-0124/P-0125 duplicates deleted completely + tour-close engine never opens a settlement for a settled load | CC-1 | INPROGRESS |
| 34 | R228 | Drivers | OWNER 10-24: driver licence data check waived (still names drivers) until owner updates driver data | LEAD | INPROGRESS |
| 35 | R229 | Fleet | OWNER 10-24: USMCA has 16 trucks; app shows 43 leased to USMCA (13 measured with loads in 60 d) | OWNER | OPEN |
| 36 | R230 | Banking | Bank match suggests SETS of documents by amount math (one wire = several Faro purchases); multi-select + Resolve difference; a purchase already on a deposit is not offered twice | LEAD | DONE-LIVE — merged #27494; verify-bank-match-combinations PASS on main 23:10Z (deposit exclusion, combinations, multi-document Resolve difference) |
| 37 | R231 | Banking | One bank line = purchase(s) + LOAN: rest of the line becomes a related-party loan document (GL + document); unmatch reverses it | LEAD | MERGED-UNVERIFIED — merged #27494; verify-bank-match-combinations PASS; prod: 25 related-party loan entries, 9 bank-linked, 0 on a line that also carries a purchase — no live instance yet to prove the purchase+loan split |
| 38 | R232 | Banking | 4 banking test files red on main; Plaid Login Required / Stale looked identical to Healthy | LEAD | MERGED-UNVERIFIED — #28536: 3 stale banking tests fixed (router missing; board label "name · institution"); src/pages/banking 93/93 pass |
| 39 | R233 | Reports | Heavy CI red since 10-23: reports guard read the moved quick-links | LEAD | DONE-LIVE — verify-reports-home-filter-leaf-ownership / -no-box-in-box / rpt-s01-s05 PASS on main 22:58Z |
| 40 | R234 | System | Transaction Health paging dropped ~20% of documents (1,500 of 1,855); bill payments labelled by UUID; account numbers hidden by default | LEAD | DONE-LIVE — live /system?tab=tx-health 23:30Z: keyset "Load more" paging; bill payments labelled "Payment · <payee> · date · $"; money with $; JE link raw uuid fixed #28187 173b1b56b → "Journal entry — Fuel unit T164 Love's RELAY (def+diesel)", 0 uuids on page |
| 41 | R306 | Legal | Lawsuits only in Legal (owner 10-24 3:47 PM CT): Insurance tab removed, /insurance/lawsuits redirects | LEAD | DONE-LIVE — live: /insurance/lawsuits → /legal/lawsuits (h1 "Lawsuits") 23:05Z |
| 42 | R307 | Legal | Legal › Lawsuits = legal-matters board locked to type lawsuit (design: lawsuits are matters); lawsuit links → ?insurance_lawsuit_id= | LEAD | DONE-LIVE — merged b87d8b2d3 (#27552); verify-legal-matter-lawsuit-linkage PASS on main 23:10Z |
| 43 | NEW 11-02 | Owner | AUTH-474..480 owner decisions (ENG-60 drop, ENG-04 $705.97, ENG-25b, ENG-48 repair, ENG-22, ENG-54) | OWNER | OPEN |
| 44 | NEW 11-02 | Repo | 4 Dependabot PRs (#27892 #27894 #27964 #27965) — test on branch then merge | LEAD | PARTIAL — #27965 production deps: npm ci + backend/frontend/driver-pwa builds + backend vitest identical to main (35 files / 46 tests fail on BOTH) → merged 9350071e1; #27964 + #27894 lockfile drift after #27965 (rolldown 1.2.14 vs 1.2.16) → @dependabot rebase requested 23:27Z; #27892 codeql-action 4.39.1 branch updated, CI re-running |

## B · Board design (layered / chrome-only)

| # | Src | Area | Item | Seat | Status |
|---|---|---|---|---|---|
| 45 | R31 | Cash Flow | Cash Flow › Home — board verdict PARTIAL | Cursor | MERGED-UNVERIFIED — CashFlowHomeTab BoardSection/V3; verify-cash-flow-home-tab; live board verdict UNVERIFIED |
| 46 | R32 | Cash Flow | Cash Flow › Projected (Auto) — board verdict PARTIAL | Cursor | MERGED-UNVERIFIED — Projected tab + D042/D073 guards; live board verdict UNVERIFIED |
| 47 | R33 | Cash Flow | Cash Flow › Actual vs Projected — board verdict PARTIAL | Cursor | MERGED-UNVERIFIED — AvP BoardSection/V3 + formatUsdCents axis; live board verdict UNVERIFIED |
| 48 | R34 | Cash Flow | Cash Flow › Rolling Ledger — board verdict LAYERED | Cursor | MERGED-UNVERIFIED — RollingLedgerTab ParityTable; live board verdict UNVERIFIED |
| 49 | R35 | Cash Flow | Cash Flow › Manual — board verdict LAYERED | Cursor | MERGED-UNVERIFIED — ManualDailyProjectionsTab; live board verdict UNVERIFIED |
| 50 | R37 | Accounting | Accounting › Unexpected — board verdict REBUILT | Cursor | MERGED-UNVERIFIED — UnexpectedExpensesPage board; live verdict UNVERIFIED |
| 51 | R38 | Banking | Banking › Home — board verdict REBUILT | Cursor | MERGED-UNVERIFIED — BankingHomeBoard BoardSection/ParityTable; live verdict UNVERIFIED |
| 52 | R39 | Factoring | Factoring › Home — board verdict LAYERED | Cursor | MERGED-UNVERIFIED — FactoringHomeBoard tabs-first; verify-factoring-layout-tabs-first; live UNVERIFIED |
| 53 | R40 | Reports | Reports › Home — board verdict LAYERED | CC-3 | MERGED — #28601; guard wired 19905 (#28624); live UI proof pending |
| 54 | R41 | Reports | Reports › Trial balance viewer — board verdict PARTIAL | CC-3 | DONE-LIVE — #28541; Lead live check 11-03 5:00–5:15 PM CT, 1440×900, Owner/USMCA: Q4 debits $1,628,649.66 = credits $1,628,649.66, 52 accounts, Balanced |
| 55 | R42 | Customers | Customers › Home — board verdict CHROME-ONLY | CC-3 | MERGED-UNVERIFIED — #28549 (Lead): Customers Home rebuilt to V3 board from /api/v1/mdata/boards/customers. Prod YTD: 87 with transactions, 193 invoices, billed $659,426.72, A/R open $659,426.72 (68.0% past due), collected $0.00 (row 89) |
| 56 | R43 | Vendors | Vendors › Home — board verdict CHROME-ONLY | CC-3 | MERGED-UNVERIFIED — #28549: Vendors Home cells link (category, pays-through); 30 vendors with transactions, spend YTD $363,227.28 |
| 57 | R44 | Settlements | Settlements › Home — board verdict LAYERED | Cursor | DONE-LIVE — Codex batch96 17:20CT selected-week caption CLOSED after #28561; company-calendar week_start/title. Non-CT browser not claimed |
| 58 | R45 | Settlements | Settlements › Open — board verdict PARTIAL | Cursor | MERGED-UNVERIFIED — SettlementsToursRegister Open V3 board; live verdict UNVERIFIED |
| 59 | R46 | Settlements | Settlements › Closed — board verdict PARTIAL | Cursor | MERGED-UNVERIFIED — SettlementsToursRegister Closed V3 board; live verdict UNVERIFIED |
| 60 | R47 | Settlements | Settlements › Statement — board verdict LAYERED | Cursor | MERGED-UNVERIFIED |
| 61 | R48 | Settlements | Settlements › Pre-Settlements — board verdict LAYERED | Cursor | MERGED-UNVERIFIED |
| 62 | R49 | Settlements | Settlements › Close — board verdict LAYERED | Cursor | MERGED-UNVERIFIED — SettlementCloseArrivalPage + Settlements subnav; live UNVERIFIED |
| 63 | R50 | Settlements | Settlements › Company — board verdict REBUILT | Cursor | MERGED-UNVERIFIED — CompanySettlementsPage listTours board; live verdict UNVERIFIED |
| 64 | R51 | Settlements | Settlements › Deductions — board verdict CHROME-ONLY | Cursor | MERGED-UNVERIFIED |
| 65 | R52 | Settlements | Settlements › Cash Advances — board verdict CHROME-ONLY | Cursor | MERGED-UNVERIFIED |
| 66 | R53 | Settlements | Settlements › Escrow — board verdict CHROME-ONLY | Cursor | MERGED-UNVERIFIED — SettlementsEscrowBoard; live UNVERIFIED |
| 67 | R54 | Settlements | Settlements › Escrow Register — board verdict PARTIAL | Cursor | MERGED-UNVERIFIED — EscrowRegisterPage Opening balance + ParityTable; live verdict UNVERIFIED |
| 68 | R55 | Fuel | Fuel › Home — board verdict CHROME-ONLY | Cursor | MERGED-UNVERIFIED — FuelPlannerHome / FuelBoardKpiStrip; live UNVERIFIED |
| 69 | R56 | Fuel | Fuel › 10 sub-tabs — board verdict CHROME-ONLY | Cursor | MERGED-UNVERIFIED — FUEL_SUBNAV + FuelPlannerHome tabs; live UNVERIFIED |
| 70 | R58 | Maintenance | Maintenance › Home — board verdict PARTIAL | LEAD | CODED |
| 71 | R59 | Maintenance | Maintenance › In Shop — board verdict LAYERED | LEAD | CODED-QUEUED |
| 72 | R60 | Driver Profile | Driver Profile › Board — board verdict NOT STARTED | LEAD | CODED |
| 73 | R61 | Dispatch | Dispatch › Truck Planner — board verdict PARTIAL | CC-3 | MERGED-UNVERIFIED |
| 74 | R62 | Dispatch | Dispatch › Book Load modal/side/spec — board verdict PARTIAL | CC-3 | MERGED-UNVERIFIED |
| 75 | R64 | Insurance | Insurance › Home — board verdict REBUILT | LEAD | CODED |
| 76 | R313 | Settlements | Design audit N2: Escrow register 'Opening balance (historical)' row (design) missing — running balance cannot tie | Cursor | MERGED-UNVERIFIED — EscrowRegisterPage Opening balance (historical) first line; live UNVERIFIED |
| 77 | R314 | Settlements | Design audit N3: settlement statement body has no drill links ('[n] fills →', 'BofA line →') | Cursor | MERGED-UNVERIFIED — SettlementStatementLinkedRecordsPanel n fills → + Bank line →; live UNVERIFIED |

## C · Reports & Load history builds

| # | Src | Area | Item | Seat | Status |
|---|---|---|---|---|---|
| 78 | R66 | Reports/Dispatch | Dispatch › Load history (198 loads, every cell opens its record, load detail panel with timeline + money + linked records) | CC-1 | MERGED-UNVERIFIED — #28576 (Lead): /dispatch/load-history board (198 booked · 194 shown · 4 cancelled; empty miles 23,099.9 = 7.2%); panel = timeline + money + linked records; every cell opens its record |
| 79 | R67 | Reports/Dispatch | Reports › Loads report (week/month/customer/driver/truck/lane/trip type) | CC-1 | DONE-LIVE — #28529; Lead live check 11-03 5:00–5:15 PM CT, 1440×900, Owner/USMCA: /reports/loads 194 loads, revenue $616,126.72, 298,186 loaded mi |
| 80 | R68 | Reports/Dispatch | Reports › Driver settlement report (by settlement / driver, paid state) | CC-1 | DONE-LIVE — #28529; Lead live check 11-03 5:00–5:15 PM CT, 1440×900, Owner/USMCA: 92 settlements, net $134,675.96 = prod SQL (period-year 2001 display defect → live-fails-2) |
| 81 | R69 | Reports/Dispatch | Reports › Company settlement report (profit per closed trip) | CC-1 | DONE-LIVE — #28529; Lead live check 11-03 5:00–5:15 PM CT, 1440×900, Owner/USMCA: 89 closed trips, margin $131,888.36 (21.4%) |
| 82 | R70 | Reports/Dispatch | Reports › Customer report (sales, open, aging, statement) | CC-1 | DONE-LIVE — #28529; Lead live check 11-03 5:00–5:15 PM CT, 1440×900, Owner/USMCA: 193 invoices, billed $659,426.72, open $621,076.72 |
| 83 | R71 | Reports/Dispatch | Reports › Vendor report (spend, open bills, category, 1099) | CC-1 | DONE-LIVE — #28529; Lead live check 11-03 5:00–5:15 PM CT, 1440×900, Owner/USMCA: 30 vendors, spend $363,227.28, open bills $26,560.67 (35) |
| 84 | R72 | Reports/Dispatch | Reports home: add the 5 reports to the catalog; remove unrouted duplicates LoadHistoryPage.tsx / LoadsReportPage.tsx by replacing them with the board pages | CC-1 | DONE-LIVE — #28529; Lead live check 11-03 5:00–5:15 PM CT, 1440×900, Owner/USMCA: /reports catalog 20 reports |

## E · Money defects (engines)

| # | Src | Area | Item | Seat | Status |
|---|---|---|---|---|---|
| 85 | R73 | Driver pay | 3 delivered loads never accrued to A/P: 13663, 13687, 13688 ($2,056.34) | CC-1 | DONE-LIVE — prod: 7 delivery accruals posted 11-03 23:50:59–23:51:06Z = $5,319.11 exactly (13663 405.72 · 13688 844.07 · 13690 537.60 · 13692 979.45 · 13694 699.17 · 13695 979.45 · 13698 873.65); 13687 false positive (A/P at close); 13693 skipped by name — OWNER ($979.45 bill vs P-0115 $940.27) |
| 86 | R74 | Dispatch | 4 loads delivered_pending_docs with no final-stop actual departure: 13691, 13694, 13696, 13697 | CC-3 | MERGED-UNVERIFIED |
| 87 | R75 | Settlements | Settlement load-cost totals 25-50% below recount; P-0119/P-0113 $0 costs; GPS real miles 4,855 vs 1,110 | CC-1 | DONE (read model correct) — all 87 closed settlements: shown $326,549.58 vs signed-number recount $308,875.74, every gap named (63 docs $27,298.30 cross-trip signed · 60 docs $26,253.87 · 405 no-settlement $17,975.02 · bills $743.25); P-0113/P-0119 $0 = no fuel imported after 10-19; GPS 4,855 raw → 988.4 after speed filter; 4 unconfirmed fuel loads $1,564.79 → OWNER |
| 88 | R76 | Settlements | 0 of 85 closed settlements marked paid ($127,897.75) | CC-2 | PARTIAL — PR #28634 settlement-paid rollup (paid only from real cash bill payments) awaits OWNER merge; prod: 87 closed, 0 paid, $128,466.58 open A/P, $0 real cash payments (7 ACH payments voided 10-11/10-24) — settles when OWNER records payouts / matches bank lines |
| 89 | R77 | A/R | 0 customer payments / Faro purchases applied: all $621,076.72 open incl. 57 advanced invoices | CC-2 | MERGED — #28615 factoring engines; posting Faro receipts = matching real money → OWNER |
| 90 | R78 | Banking | 1090 Undeposited $170,210.48 (33 Faro advances never deposited) -> GL bank -$88,433.89 | CC-2 | MERGED — #28615; residual tie needs owner Faro decisions |
| 91 | R79 | Cash Flow | Card payables not in forecast: Dreamline 2510 $187,894.21, WEX 2520 $29,156.88 | CC-1 | MERGED — #28618 (deploy 150dd4b); live UI proof pending |
| 92 | R80 | Dispatch | Load 13699 Bradley IL delivery stop city-only (no street/ZIP) | CC-3 | OPEN |
| 93 | R81 | HOS | 222,587 duty events on merged driver shells | CC-2 | DONE-LIVE — prod 11-04 01:10Z: samsara.hos_snapshots on shells 49,486 → 0 (audits b347c2e2, 0494d1e5); hos.duty_status_events on shells 9,034 → 408 (all exact duplicates of a survivor event, kept by design); writers resolve the survivor (#28622, migration 202616340100 applied 00:40:56Z) |
| 94 | R82 | Accounting | Rafael salary bill P-0069 / 13530 $300 unpaid since 08-21, due_date NULL | CC-1 | DONE-LIVE — #28605; prod 7 driver bill due dates set from load_driver_pay_due (13530 08-21→08-19, 13546, 13562, 13687, 13691, 13696, 13697) |
| 95 | R83 | Accounting | R2: 241 Dreamline statement discount JEs ($10,744.65) -> card-credit documents | CC-2 | PARTIAL |
| 96 | R84 | Settlements | 5 settlement headers re-derive (P-0105/0107/0108/0109/0115); P-0115 carries two NBs incl. 13663 | CC-2 | CODED |
| 97 | R85 | Vendors | All 30 vendors have no category | CC-1 | MERGED — #28610; guard wired 19907 (#28624) |
| 98 | R86 | Settlements | 3 recent closed settlements have no number / company settlement not opened (P-0119, P-0113, P-0117) | CC-1 | DONE-LIVE — #28583 + Lead prod repair 23:36Z: company settlement P-0119 → 5854 (driver settlement source_document_ref 5854), audit event; P-0113 = 5852, P-0117 = 5853 already. Close now renumbers (company_settlement_number_taken refusal) |
| 99 | R113 | Banking | 43 Plaid PENDING lines in October never replaced by their posted lines (e.g. SOUTH TX TRUCK CENTERS -460.01 pending 10-03 + posted 10-05) -> Banking Money in/out ($216,532.56 / $239,059.03) and Unexpected "possible duplicates" count them twice | CC-2 | DONE-LIVE — Lead 23:00Z prod: 248 pending lines voided (replaced_by_plaid_posted / plaid_stale_pending_sweep); 11 live pending all ≥ 10-28; South Texas Truck Centers -460.01 = 1 live line (10-05) |
| 100 | R201 | Platform | 443.284 main static reds from 10-23 board merges block every push (7:40 PM: 2 fixed, 5 red) | CC-2 | CODED |
| 101 | R202 | Fuel | verify-no-internal-payload-in-notes red: dreamline-statement-import memo interpolates input.expenseId (afd3fd334e) | CC-2 | DONE-LIVE — prod 23:10Z: 0 journal entries / 0 expense memos contain "· session <uuid>"; static rules 0 interpolated ids in Dreamline memos; selftest 7/7 |
| 102 | R207 | Guards | Guards for 443.288 (child follows parent, no machine-final load, close refuses proposed, family moves) | CC-2 | MERGED-UNVERIFIED — #28550 (Lead): guard verify-443-288-person-confirms-load (selftest 21/21). Fixed: family move on in-place confirm; the system user can no longer confirm a load (MACHINE_CANNOT_CONFIRM_LOAD, one writer); Relay fills move by Relay id. Open: 11 child expenses on another load than their receipt (AUTH-457 repair on prod) |
| 103 | R209 | Guards | 107 main static reds outside baseline split by seat | Cursor | MERGED-UNVERIFIED — verify-static-ratchet PASS status=seeded names=378 on main; live full static suite UNVERIFIED |
| 104 | R210 | Platform | 6,266 guard scripts (488 live, ~5,700 source-text, 316 slate-color copies) | CC-2 | OPEN |
| 105 | R223 | Fuel | Fuel evidence: odometer blank, "no GPS truck" while truck parked at pump | CC-2 | MERGED-UNVERIFIED — #28482 (Lead): parked-truck rule (consecutive fixes ≤483 m bracketing the fill) + odometer_mi; applies at the 06:00 CT fill sweep |

## ENG · Engine register

| # | Src | Area | Item | Seat | Status |
|---|---|---|---|---|---|
| 106 | R235 | Settlements | Escrow with a balance always visible (active or inactive driver); 11 orphan TEST escrow accounts deleted; DB refuses deleting a driver/vendor that still has escrow | LEAD | DONE-LIVE — merged 91ba4c9cd; prod: triggers trg_refuse_driver_delete_with_escrow + trg_refuse_vendor_delete_with_escrow present; 33 USMCA escrow accounts, 0 orphan holders, 0 TEST-named |
| 107 | R236 | Reports | ENG-19 Company settlement report + Trip Profitability counted fuel twice (fuel fill's own expense); 61 of 81 settlements negative -> 23; net -$177,024.87 -> +$113,862.11; trips negative 66 of 92 -> 25 | LEAD | DONE-LIVE — ENG-19 merged; re-measured 11-02 per signed document: 21 of 87 negative, only 5778 and 5793 truly negative (docs/bus/lead/11-02-2026-Claude-Lead-ENG36-MEASURED-ENG61-FUEL-OUTSIDE-TRIP.md) |
| 108 | R237 | Ledger | AUTH-461 / AUTH-462 recorded in OWNER-AUTHORIZATIONS.md with owner quotes and audit counts | LEAD | DONE-LIVE — merged #27520; docs/bus/OWNER-AUTHORIZATIONS.md AUTH-461 (line 8066, COMMITTED 10-24 17:10Z) and AUTH-462 (line 8076) |
| 109 | R238 | Dispatch | Load 13699 (Copamex, in transit) delivery stop is 'Bradley, IL' with no street; verify-stops-are-geocoded RED live, blocks dispatch-touching pushes (443.301) | OWNER | OPEN |
| 110 | R242 | Accounting | ENG-04 2170 Driver Net-Pay Clearing Cr $2,575.96 / 12 postings — tie to open net pay, clear through documents | CC-1 | PARTIAL — #28640: ENG-04 evidence no longer counts voided / double-claimed bank lines; 2170 = $2,575.96 = 12 historical advance cash legs (CA-0001..0012), $0 net pay; corrected evidence: 1 unique (CA-0005 $151.99), 8 ambiguous, 3 none → OWNER picks bank lines; $705.97 decision (row 43) must be re-made |
| 111 | R251 | Dispatch | ENG-13 G1: 129 loads (10-11) with no trailer choice — back-fill from documents | CC-2 | PARTIAL |
| 112 | R255 | Accounting | ENG-17 1090 $170,210.48 / 2510 $187,894.21 residuals — tie document by document (rows 78, 79) | CC-2 | MERGED — #28615; residual tie needs owner Faro decisions |
| 113 | R257 | Dispatch | ENG-22 G2: 195 of 198 loads on one trailer type id that does not resolve in catalogs.equipment_types — verify reefer vs dry van | CC-3 | DONE-LIVE — #28541 + Lead prod repair 23:08Z: 3 cancelled loads 13593/13634/13635 DRY_VAN → REFRIGERATED_VAN (company reefer trailers 10219/10870/10218), audit 6da04ce4/fc674f44/6888bf9e. Prod now DRY_VAN 31 / REFRIGERATED_VAN 106 / FLATBED 61; 198/198 resolve in catalogs.load_trailer_equipment (the "195 unresolved" read the wrong catalog). bills.service wrong join removed |
| 114 | R258 | Dispatch | ENG-23 G3: audit loads booked under the old oldest-customer fallback against their documents | CC-3 | OPEN |
| 115 | R262 | Banking | ENG-27 G6: 458 bank-categorization postings before 10-17 without a load — back-fill or explain | CC-3 | PARTIAL |
| 116 | R264 | Settlements | ENG-29 real driven miles: 12 of 198 loads have miles_driven_actual — fill from fence events | CC-3 | PARTIAL — #28622: no-OBD crossings measured through the anchor; E11 boundary reads outside the per-day key; open: 98 delivered loads need the yard / cross-dock stop rule (OWNER) |
| 117 | R269 | Engine | ENG-34 920 guard-exempt entries (CI does not run them) — wire or delete, shrink-only | CC-1 | PARTIAL |
| 118 | R271 | Reports | ENG-36 23 company settlements still negative after ENG-19 — measure each | LEAD | DONE-LIVE — measured each (#28140 + addendum #28141): 21 of 87; causes routed — ENG-64 fuel outside trip (CC-3), ENG-65 unlinked Relay fills (CC-1), ENG-25b Transportation diesel; 5824/5829 signed docs not found on owner Mac stage |
| 119 | R273 | Accounting | ENG-38 periods: 24 USMCA periods all open — lock closed months (owner names the months) | OWNER | OPEN |
| 120 | R274 | Banking | M1 candidates scoped to the bank line's account | - | MERGED-UNVERIFIED |
| 121 | R275 | Banking | M2 invoices + Faro purchases in the match union | - | MERGED-UNVERIFIED |
| 122 | R276 | Banking | M3/M5 one matcher (MatchDrawer embedded); filters live | - | MERGED-UNVERIFIED |
| 123 | R281 | Accounting | Cash-basis P&L (F412), bank-line delete rule (F431), recurring worker refusal, 7-day unmatched alert, reefer off IFTA, A/P control by documents, matched-to-nothing refusal | - | MERGED-UNVERIFIED |
| 124 | R289 | Driver pay | ENG-44 bill 13697 due date; salaried stray bill not voided; presettlement autolink 13556/13563; live_load_number self-referential 13694/13695 | CC-1 | PARTIAL — #28605 due dates live; salaried stray bills 13544/13563 void needs OWNER OK |
| 125 | R291 | Accounting | ENG-46 bill_payment ad02cc37 no source link; escrow sub-ledger 315,000¢ vs baseline 132,500¢; 5796/P-0102 USMCA settlement for a Transportation document | CC-1 | DONE (measured clean) — ad02cc37 = P-0117 $25 escrow deduction, linked; escrow GL = sub-ledger = view = $3,200.00 (60 docs, 0 mismatch); 5796/P-0102 all-USMCA; note: 2 closed duplicate escrow accounts inflate v_escrow_account_balance by $775.00 (display only) |
| 126 | R292 | Engine | ENG-47 guards stale vs owner rulings: TIO PERFUMES kept; voids are design; S-13655/56; unbilled revenue migration; 'USMCA hidden'; archive tables RLS | CC-1 | PARTIAL |
| 127 | R293 | Fuel | ENG-48 fuel-expense one-to-one (13563-1 JE 0¢ + 14 loads); same-day duplicate fill pairs; traceability shrink fc461eb6; literal account '5000' in statement-card-credit-repair | CC-2 | DONE-LIVE — #28623; prod fuel row ddc51b70 fee 0 → 2.00 (audit a1edce94); 4 duplicate fill pairs need the statement document |
| 128 | R294 | Settlements | ENG-49 settlement 5787 non-diesel expenses $235.01 vs signed $140.20 | CC-2 | MERGED — #28623 read-model sign rule (P-0018 non-diesel $140.22 vs signed $140.20, $0.02 named Dreamline DEF differences); UI proof pending |
| 129 | R295 | Factoring | ENG-50 invoice amount_paid vs applications (9-13515 $525, 7 $350); book = Faro = AlwaysTrack 12 issues; factoring-advance-links-its-load selftest | CC-2 | MERGED — #28623 writers closed, live data consistent (193 invoices, 0 mismatches); Faro collections = OWNER (no receipts after AUTH-001 purge) |
| 130 | R296 | Banking | ENG-51 944 composite-memo rows unbackfilled; 1 Creator load miles without source | CC-2 | DONE-LIVE — #28623; prod 01:03Z 3 relearn events delivered: 13696 1644.0 / 13697 1110.0 / 13699 1338.0 unchanged, miles_choice.practical.source = manual |
| 131 | R298 | Dispatch | ENG-53 13690 deadhead NULL; 16 live loads missing mileage; T174 odometer capture 49.7 h stale; 13700 no stop stamps; stops-gps-verified > 120 s | CC-3 | PARTIAL — #28622 + #28627: 11 NULL deadheads re-queued 01:03Z, 9 filled (13688 20.2 · 13691 195.5 · 13692 175.3 · 13694 90.1 · 13695 450.3 · 13696 180.6 · 13697 29.0 · 13698 4.7 · 13699 148.2); 13687 (1,875.6) and 13690 (199.0) were measured across overlapping loads of the truck → engine now refuses overlaps, both cleared to NULL (audits b03aa1f1, 352eba6e); open: dispatch dates 13672/13677/13682/13687 and 13690/13693 overlap — needs the source documents |
| 132 | R299 | Fleet | ENG-54 T122, T124, T156 owned by IH 35 Transportation (leased to USMCA); rule: every real truck owned by IH 35 Trucking — waits for the owner's truck list (16 trucks) | OWNER | OPEN |
| 133 | R300 | Dispatch | ENG-55 443.327 app-wide drift alert every 30 min until fixed (reconciler I9: truck cannot make next stop, no stop date, no street address, no rate); 7 live | LEAD | DONE-LIVE (alert engine) — merged #27655; prod 23:45Z: I9 population = 3 active loads (13692/13693/13695), all past delivery with no stamp — root cause filed as row 260 |
| 134 | R301 | Fuel | ENG-25b owner 10-24 2:36 PM: Transportation diesel not on USMCA loads per signed docs = loan to Transportation (8000 Inter-company - IH35 Transportation) via rewriteDocumentLine | CC-3 | OPEN |
| 135 | R303 | Migrations | ENG-57 3 migrations held off prod 23 days waiting for a Lead fork validation (202614110000 source_document_ref unique; 202615210000/0100 lease-to-own ASC 842); 0000 carried a stale role list that fails on prod — fixed (dynamic append) and released; 0200 stays superseded | LEAD | DONE-LIVE — prod ih35_migrations.applied_migrations: 202614110000, 202615210000, 202615210100 applied 2026-10-24 21:58Z |
| 136 | R304 | Engine | ENG-58 program-scoreboard.json 82 commits behind (max 80) failed every seat's step 1 — regenerated | LEAD | DONE-LIVE — merged 58bcea191 (#27654) + fallback regenerated d5b40b2ca 22:52Z; verify-derived-artifact-freshness PASS on main 23:10Z |
| 137 | R309 | Legal | ENG-60 retire the insurance.lawsuit side table: PolicyDetail lawsuit section → legal matters by claim, claim.lawsuit_id → legal matter, LawsuitsTab + 17 guards that read it; drop table after 0 rows all entities | CC-1 | PARTIAL |
| 138 | R311 | Dispatch | ENG-62 loads booked after their trip never got stop stamps (fences minted at booking; replay stamps nothing) — engine stop-arrival-from-fence-history; 13700 + 13699 delivered from the unit's own fence visits; stop-stamp ratchet 13 → 0 | LEAD | DONE-LIVE — prod 23:45Z: 0 active loads with a past pickup and no stop stamp (verify-dispatched-load-has-stop-stamps query; baseline 0) |
| 139 | LEAD-ENG-21 | Dispatch | Load 13699 (Copamex, in transit) delivery stop is 'Bradley, IL' with no street; verify-stops-are-geocoded RED live, blocks dispatch-touching pushes (443.301) | OWNER | DONE-LIVE — prod 00:10Z: 13699 delivery stop = 195 S Euclid Ave, Bradley IL (street present); delivered_pending_docs, arrival stamped 10-22 16:15Z |
| 140 | M1 | Banking | M1 candidates scoped to the bank line's account | - | MERGED-UNVERIFIED |
| 141 | M2 | Banking | M2 invoices + Faro purchases in the match union | - | MERGED-UNVERIFIED |
| 142 | M3 | Banking | M3/M5 one matcher (MatchDrawer embedded); filters live | - | MERGED-UNVERIFIED |
| 143 | G1 | Dispatch | G1/G9/G11/G12/G15 code fixes merged (data remainders in ENG-07/08/13/14) | - | MERGED-UNVERIFIED |
| 144 | LEAD-various | Accounting | Cash-basis P&L (F412), bank-line delete rule (F431), recurring worker refusal, 7-day unmatched alert, reefer off IFTA, A/P control by documents, matched-to-nothing refusal | - | DONE-LIVE — cash-basis P&L: verify-cash-basis-pl-is-computed-from-transactions PASS + engine-determinism OK; bank-line delete/void: 28 not-dead/delete-not-under-bank-line triggers enabled in prod, verify-no-hard-delete-bank-stubs PASS; recurring worker: verify-recurring-worker-never-posts PASS; 7-day unmatched: verify-unmatched-7d-is-an-alert OK; reefer off IFTA: verify-reefer-fuel-credit PASS + verify-ifta-excludes-non-highway-fuel-types static PASS; A/P control by documents: prod 00:10Z: GL 2000 A/P $129,216.53 = 184 open bills $129,216.53 (0.00 diff); 2000 posted only by bill / bill_payment / driver_settlement; matched-to-nothing: trg_bank_line_not_matched_to_nothing enabled, 0 live bank lines pointing at a missing/voided document, verify-match-posts-nothing PASS |
| 145 | NEW 11-02 | Fuel | ENG-64 fuel outside the trip window | LEAD | PARTIAL — 06:00 CT sweep ran: 22 fills resolved, 2 receipts reattributed, 10 USMCA questions opened; DEFECT found + fixed #28648: the sweep also ran for frozen IH 35 Transportation and opened 1,631 questions there (no fills moved) → OWNER: void those 1,631 rows?; USMCA unresolved 635 |
| 146 | NEW 11-02 | Fuel | ENG-65 90 Relay fill expenses $38,717.03 with no linked fuel row (18 link / 48 import / 24 dedupe) | CC-1 | DONE-LIVE (3 named) — 06:00 CT run: 45 Relay fill expenses linked to their fuel record; Relay fill expenses without a fuel record 90 → 3 (each refused by name: two DEF lines on txn_8LZfDKWFvFv1oD, one fill with no driver, one with no truck) |
| 147 | NEW 11-02 | Telematics | Deadlock live proof after #28131 leases (before: geofence 4, positions 6, status-switch 4) | LEAD | DONE-LIVE — Render backend logs: last "deadlock detected" 21:25:35Z; after the deploy containing #28131 (1d1e9f18b live 22:07:24Z) 0 through 23:32:37Z (85 min); 0 from 21:25:35Z to 22:53Z (88 min; 7 in the 25 min before); pg_stat_database.deadlocks flat 3825 22:49:45Z→22:52:49Z |

## F · Live findings (tie-outs)

| # | Src | Area | Item | Seat | Status |
|---|---|---|---|---|---|
| 148 | R89 | Cash Flow | Three different opening-cash figures: Home $25,533.37, Manual bank total $102,867.17, Manual opening $0.00 | CC-1 | MERGED — #28618 (deploy 150dd4b); live UI proof pending |
| 149 | R90 | Cash Flow | Manual "bank balances" counts card payables and Faro as cash: Dreamline -$140,226.34 (GL 2510 -$187,894.21), WEX +$29,156.88 (a payable shown positive), Faro Factoring $175,650.00 | CC-1 | MERGED — #28618 (deploy 150dd4b); live UI proof pending |
| 150 | R93 | Accounting | Open bills $126,443.92 / 179 vs A/P subledger $126,437.22 / 177 (diff $6.70, 2 bills) | CC-1 | DONE-LIVE — prod 00:10Z: GL 2000 A/P $129,216.53 = 184 open bills $129,216.53 (0.00 diff); 2000 posted only by bill / bill_payment / driver_settlement |
| 151 | R94 | Accounting | Open invoices header $624,076.72 / 165 vs aging $621,076.72 / 164 (proforma 169-13690 $3,000 counted in header) | CC-1 | DONE-LIVE — prod 00:15Z: 0 proforma invoices; views.ar_aging $621,076.72 / 164 = GL 1100 $621,076.72 |
| 152 | R95 | Accounting | Cash pulse Oct: IN $0.00 / OUT $1,590.00 while Banking shows money in $216,532.56 / out $239,059.03 | CC-1 | DONE-LIVE (code) — 11-04 02:15Z prod SQL: Oct IN pulse $281,404.15 = Banking $281,404.15; OUT $284,129.85 vs $285,153.62 = 2 stale pending debits Banking double-counts ($45.47 + $978.30). OWNER: Banking tiles cleared-only? |
| 153 | R96 | Accounting | QBO sync "Not connected" | OWNER | OPEN |
| 154 | R97 | Banking | Reconciliation drift: BofA bank $1,808.13 vs book -$88,433.89 (diff $90,242.02); Relay Fuel Wallet listed twice | CC-2 | OPEN — likely driven by row 156 stale pendings ($51,296.34) — CC-2 re-measures after the pending fix |
| 155 | R98 | Factoring | KPI renders raw "175650.000000000000" and "170210.480000000000"; True cost 0.00% with fees $2,634.76 | Cursor | MERGED-UNVERIFIED — fmtMoneyDollars + trueCostPercent guards PASS; live USMCA UNVERIFIED |
| 156 | R99 | Unexpected | Possible duplicates 0 while bank lines repeat (460.01 on 10-03 and 10-05; 155.86 twice on 10-07) | CC-2 | DONE-LIVE — Lead 23:00Z prod: -460.01 and -155.86 each 1 live line; the repeats were pending lines, now voided by the replace/sweep engine |
| 157 | R100 | Customers | 201 possible duplicate customers flagged; billed shows $624,076.72 (incl. proforma) | CC-3 | MERGED — #28610; guard wired 19907 |
| 158 | R101 | Vendors | 86 possible duplicate vendors; Open bills $126,443.92 includes driver bills; Spend YTD $351,241.23 vs expenses $353,241.23 | CC-1 | DONE-LIVE — prod 00:10Z: GL 2000 A/P $129,216.53 = 184 open bills $129,216.53 (0.00 diff); 2000 posted only by bill / bill_payment / driver_settlement |
| 159 | R102 | Settlements | Home "Week of Oct 18" lists closed settlements (P-0108 etc.) with status Open; "Settlement (Closed)" toggle empty; Drivers w/ debt 0 | Cursor | DONE-LIVE — Codex batch96 17:20CT selected-week caption + week identity CLOSED (#28561); Closed pill = trip_closed_at OR terminal; Status Paid/Open (v3). Non-CT browser not claimed |
| 160 | R103 | Settlements | Company Settlements shows 0 / Loading for ~6 s before data (87 closed, 6 not opened) | Cursor | MERGED-UNVERIFIED — KPIs show … while toursQuery.isPending (no flash 0); live UNVERIFIED |
| 161 | R104 | Fuel | Cards: 0 card assignments; Relay issuer blank | CC-2 | PARTIAL — Lead 23:10Z: issuer set; 27 of 27 card assignments now carry their driver (card digits = the driver Relay id, integrations.relay_driver_links), 27 audit events. Open: A→B→A unit periods Codex rejected (CC-2) |
| 162 | R105 | Fuel | Relay unmatched 257 fills (truck matched, driver never matched) | CC-2 | MERGED-UNVERIFIED — #28531 (Lead, 22:50Z): integrations.relay_driver_links (17 links, 15 drivers) + matcher reads it + rematch in the fuel ingest hook. Fork br-solitary-cloud-akbd7y9h: fills with driver 19 → 280/281 (1 has no Relay id). Prod: migration at deploy, rematch at 06:00 CT |
| 163 | R106 | Fuel | History & savings / Compliance: every value "Not available"; Loves prices never synced | CC-2 | MERGED — #28610 (Loves price feed needs LOVES_CARD_CSV_URL — OWNER) |
| 164 | R107 | Fuel | Home MTD spend $91,539 vs Fuel board figure; Avg $/gal $5.44 | CC-2 | MERGED-UNVERIFIED — #28530; live Nov 1–3 has 0 fills (cannot compare); Oct spend-summary $76,349.13 / 13,897.553 gal / $5.4937. Diesel-by-truck HTTP 400 (limit 500 > 200) → live-fails-2 |
| 165 | R108 | Maintenance | All 43 trucks "PM reading unavailable"; 0 work orders; MTD cost $0.00 | CC-2 | DONE-LIVE — live /maintenance 23:35Z: PM states shown ("No PM clock" + "Start PM clock →", never a false OK — verify-fleet-health-no-false-ok); prod: USMCA maintenance.work_orders = 0 (true empty), MTD $0.00 true |
| 166 | R109 | Dispatch | Load board HOS columns blank for most trucks; Truck planner driver column "—" for trucks with drivers | CC-3 | DONE-LIVE — #28530; Lead live check 11-03 5:00–5:15 PM CT, 1440×900, Owner/USMCA: truck planner 13 of 16 trucks named, T156 Angel Alfonso Sosa Perez |
| 167 | R110 | Driver Profile | Angel Sosa: "No current truck assignment" while on T156 (13697); documents all "Not recorded" | CC-2 | PARTIAL — #28530 live: truck T156 PASS; CDL shows 09/21/2029 vs 2029-09-22 (UTC→CT shift) → Lead live-fails-2 |
| 168 | R111 | Insurance | Insurance page renders inside the Safety header/tab shell | CC-2 | CODED |
| 169 | R112 | Legal | Open matters 0 on page while legal.matters holds 18 rows (test records) | CC-2 | DONE-LIVE — prod 00:15Z: legal.matters USMCA = 0 rows (the 18 test rows are gone) — "Open matters 0" is the true count |
| 170 | R200 | Accounting | Accounting "Open invoices" KPI $624,076.72/165 vs GL A/R 1100 $621,076.72/164 (1 proforma $3,000.00 counted) | LEAD | DONE-LIVE — prod views.ar_aging $621,076.72 / 164 open = GL 1100 $621,076.72 (322 postings) = 183 sent invoices $621,076.72; no proforma rows live |
| 171 | R203 | Linkage | Linkage gate red (verify-every-load-born-posting-carries-its-load) blocks every money push | LEAD | DONE-LIVE — CI required-live-load-guard 22:20Z: verify-every-load-born-document-and-posting-traces-to-its-load — unstamped postings 0, broken walks 0, load expenses without link 0 |
| 172 | R204 | Fuel | Statement card discount / difference is a separate expense with NO link to its receipt; copies the load once, never follows a move | CC-2 | CODED |
| 173 | R211 | Cash Flow | Actual vs Projected + Manual reverted to pre-board code by #27390 | LEAD | DONE-LIVE — live /cash-flow?tab=actual_vs_projected 00:05Z: board renders (KPIs, cumulative chart, by-date table 10/26–11/01); new defect found → row 261 |

## G · Guards red

| # | Src | Area | Item | Seat | Status |
|---|---|---|---|---|---|
| 174 | R115 | Guards | verify-stops-are-geocoded red (13699) — live-data exception for CC-2 migration | CC-2 | DONE-LIVE — #28550 + prod (guard SQL, Lead builder 23:10Z): 0 active loads with an ungeocoded stop; 13699 Bradley IL now 195 S Euclid Ave 60915 geocoded. Named, expiring OWNER_ADDRESS_PENDING exception list added (empty) |
| 175 | R116 | Guards | verify-resettlement-origin-load-dates — guard retarget to board labels | CC-3 | MERGED-UNVERIFIED |
| 176 | R117 | Guards | verify-entity-label-rejects-uuid-shaped-name — restore protection in accounting hub | CC-3 | MERGED-UNVERIFIED |
| 177 | R118 | Guards | verify-board-page-no-legacy-sections (new) — stops layering | Codex | CODED |
| 178 | R119 | Guards | verify-entity-filters-multi-select (new) — fails on single-select entity filters | LEAD | DONE-LIVE — verify-entity-filters-multi-select PASS on main: 134 entity filters, 134 compliant, 0 failed |
| 179 | NEW 11-02 | Guards | verify-diesel-expense-fuel-dedupe red on every PR (duplicate diesel expenses, live data) | CC-1 | OPEN |

## H · Screen label / data defects

| # | Src | Area | Item | Seat | Status |
|---|---|---|---|---|---|
| 180 | R120 | Fuel › Questions › Review | D001: Clicking Review throws undefined `load_number` in FuelAssignmentPopup; whole-app crash | CC-2 | MERGED-UNVERIFIED |
| 181 | R121 | Home › Overview › Money tiles | D002: Currency values omit cents | Cursor | MERGED-UNVERIFIED — verify-home-qbo D002 cents plant PASS; live UNVERIFIED |
| 182 | R122 | Home › Overview › Driver day summary | D003: Names render all-uppercase | CC-3 | DONE-LIVE — Lead 22:58Z Chrome app.ih35dispatch.com/home: "Carlos Mauricio Pena Carvallo", "Luis Armando Sosa Perez", "Angel Alfonso Sosa Perez" |
| 183 | R123 | Home › Overview › Weekly revenue | D004: Axis dates use DD/MM without year | Cursor | MERGED-UNVERIFIED — #28495; cannot check live: Weekly revenue has no revenue in the last 7 days (no axis drawn) |
| 184 | R124 | Home › Overview › Driver summary request | D005: `/api/v1/telematics/driver-day-summary` 5,071 ms | CC-2 | DONE-LIVE — Lead 22:58Z Chrome: /api/v1/telematics/driver-day-summary 550 ms (was 11,247 ms) |
| 185 | R125 | Settlements › Navigation › Drivers | D006: Link targets `/drivers` outside module | LEAD | DONE-LIVE — live /driver-finance/settlements 00:00Z: sub-nav "Drivers" → /driver-finance/drivers (in module); only global nav + load EntityLinks leave the module |
| 186 | R126 | Settlements › Navigation › Profiles | D007: Link targets `/drivers/profiles` | Cursor | MERGED-UNVERIFIED — SETTLEMENTS_SUBNAV under /driver-finance/; verify-settlements-subnav PASS; live UNVERIFIED |
| 187 | R127 | Settlements › Navigation › Pre-Settlements | D008: Link targets `/drivers/pre-settlements` | Cursor | MERGED-UNVERIFIED — SETTLEMENTS_SUBNAV under /driver-finance/; verify-settlements-subnav PASS; live UNVERIFIED |
| 188 | R128 | Settlements › Navigation › Feed Gate | D009: Link targets `/feed-gate` | Cursor | MERGED-UNVERIFIED — SETTLEMENTS_SUBNAV under /driver-finance/; verify-settlements-subnav PASS; live UNVERIFIED |
| 189 | R129 | Settlements › Navigation › Cash Advances | D010: Link targets `/cash-advances` | Cursor | MERGED-UNVERIFIED — SETTLEMENTS_SUBNAV under /driver-finance/; verify-settlements-subnav PASS; live UNVERIFIED |
| 190 | R130 | Settlements › Navigation › Liabilities | D011: Link targets `/liabilities` | Cursor | MERGED-UNVERIFIED — SETTLEMENTS_SUBNAV under /driver-finance/; verify-settlements-subnav PASS; live UNVERIFIED |
| 191 | R131 | Settlements › Navigation › Escrow | D012: Link targets `/accounting/escrow` | Cursor | MERGED-UNVERIFIED — SETTLEMENTS_SUBNAV /driver-finance/escrow; ACCT-SURF-09 still cross-links /accounting/escrow; live UNVERIFIED |
| 192 | R132 | Settlements › Navigation › Pay Rate Templates | D013: Link targets `/drivers/pay-rate-templates` | Cursor | MERGED-UNVERIFIED — SETTLEMENTS_SUBNAV under /driver-finance/; verify-settlements-subnav PASS; live UNVERIFIED |
| 193 | R133 | Settlements › Navigation › Deductions | D014: Link targets `/drivers/deductions` | Cursor | MERGED-UNVERIFIED — SETTLEMENTS_SUBNAV under /driver-finance/; verify-settlements-subnav PASS; live UNVERIFIED |
| 194 | R135 | Fuel › Questions › Table | D016: No column chooser in rendered DOM | Cursor | MERGED-UNVERIFIED |
| 195 | R136 | Fuel › Questions › Table headers | D017: Headers have no sorting controls | Cursor | MERGED-UNVERIFIED |
| 196 | R137 | Fuel › Cards › Assign card drawer | D018: Six input controls measured 38px high | CC-3 | DONE-LIVE — #28494; Lead live check 11-03 4:47–4:58 PM CT, app.ih35dispatch.com, Owner/USMCA: Assign card 6 inputs 40.0px |
| 197 | R138 | Fuel › Cards › Driver options request | D019: `/api/v1/mdata/drivers` 4,522 ms in audit session | CC-2 | MERGED-UNVERIFIED — #28503 (set-based endpoints; driver-day-summary 11,247 → 265 ms on prod) — Lead builder, deploy pending; live check next |
| 198 | R139 | Fuel › Expense mapping › Mapping request | D020: `/api/v1/accounting/expense-category-map` 8,831 ms | CC-1 | DONE-LIVE — #28536; Lead live check 11-03 5:00–5:15 PM CT, 1440×900, Owner/USMCA: expense-category-map 309 ms (was 8,831), 1 fuel-board request |
| 199 | R140 | Dispatch › Home › Round-trip exposure | D021: Driver names abbreviated to initials | Cursor | MERGED-UNVERIFIED — driver_full_name + verify-reg038/dispatch-board-preview D021 PASS; live UNVERIFIED |
| 200 | R141 | Dispatch › Home › Return / idle / missing-bill tables | D022: Driver names all-uppercase | CC-3 | DONE-LIVE — #28500; Lead live check 11-03 4:47–4:58 PM CT, app.ih35dispatch.com, Owner/USMCA: /dispatch "Rafael Rogelio Rivero Reynoso", "Jorge Luis Infante Corona" |
| 201 | R144 | Dispatch › Load Costs › Pickup / delivery cells | D025: Dates display M/D/YY | Cursor | DONE-LIVE — #28495; Lead live check 11-03 4:47–4:58 PM CT, app.ih35dispatch.com, Owner/USMCA: PU/DEL "10/21/2026 | 10/21/2026", "10/20/2026 | 10/26/2026" |
| 202 | R145 | Dispatch › Load Costs › Driver names | D026: All-uppercase names | CC-3 | DONE-LIVE — #28500; Lead live check 11-03 4:47–4:58 PM CT, app.ih35dispatch.com, Owner/USMCA: /dispatch/load-costs "Leonel Antonio Morales", "Hugo Gaytan" |
| 203 | R146 | Dispatch › Load Costs › Settlement/Tour link | D027: Several links have only an em dash as label despite a settlement destination | CC-1 | PARTIAL — #28536 live: 11/13 labelled; 13563 and 13544 (T148 Rafael, salaried) still "—" → Lead live-fails-2; load-costs-board 41,812 ms → live-fails-2 |
| 204 | R147 | Tasks › Create Task › Inputs | D028: Eleven single-line inputs measured 38px high; textarea excluded | CC-3 | DONE-LIVE — #28494; Lead live check 11-03 4:47–4:58 PM CT, app.ih35dispatch.com, Owner/USMCA: Create Task 11 inputs 40.0px |
| 205 | R148 | Tasks › Exceptions › Since column | D029: ISO YYYY-MM-DD rendered | Cursor | DONE-LIVE — #28495; Lead live check 11-03 4:47–4:58 PM CT, app.ih35dispatch.com, Owner/USMCA: Since "10/20/2026", "10/27/2026" (residual ISO inside message text → live-fails-1) |
| 206 | R149 | Driver Hub › Driver Scheduler › Date range | D030: Subtitle uses YYYY-MM-DD; grid uses MON-DD | Cursor | DONE-LIVE — #28495; Lead live check 11-03 4:47–4:58 PM CT, app.ih35dispatch.com, Owner/USMCA: "11/03/2026 through 12/02/2026", grid "11/03/2026 … 12/02/2026" |
| 207 | R150 | Driver Hub › Driver Scheduler › Driver cells | D031: All-uppercase and inconsistent surname casing | CC-3 | DONE-LIVE — #28500; Lead live check 11-03 4:47–4:58 PM CT, app.ih35dispatch.com, Owner/USMCA: driver scheduler "Pedro Abraham Lopez Collado", "Vicente Santos Contreras" |
| 208 | R151 | Driver Hub › Driver Scheduler › Assign Temp Cover | D032: Five single-line inputs measured 38px high; pickers about 2,477px wide and dates about 1,203px | CC-3 | DONE-LIVE — #28494; Lead live check 11-03 4:47–4:58 PM CT, app.ih35dispatch.com, Owner/USMCA: Assign Temp Cover 5 inputs 40.0px |
| 209 | R152 | Maintenance › Home / Fleet Table › Money tiles | D033: MTD Cost, Open $ and severe-repair total omit cents | LEAD | DONE-LIVE — live /maintenance 23:20Z: MTD COST $0.00 (cents shown) |
| 210 | R153 | Maintenance › Create Work Order › Drawer inputs | D034: Visible single-line inputs measured 38px; customer picker about 2,408px wide, open-date input about 766px | CC-3 | DONE-LIVE — Lead live check 11-03 5:00–5:15 PM CT, 1440×900, Owner/USMCA: Create Work Order 34 inputs 40px; customer picker 366px, open date 152px |
| 211 | R154 | Maintenance › Active WOs › Table headers | D035: Load, Driver, Vendor, Bill, JE and Timing headers have no sorting button, unlike adjacent headers | LEAD | DONE-LIVE — live /maintenance/active-wos 23:32Z: every header sortable incl. Load, Driver, Vendor, Bill, JE, Timing (only the select-all checkbox column has none) |
| 212 | R155 | Safety › Hours & Fatigue › Driver roster | D036: Mixed proper-case and all-uppercase driver names | CC-3 | DONE-LIVE — #28500; Lead live check 11-03 4:47–4:58 PM CT, app.ih35dispatch.com, Owner/USMCA: /safety/hos "Angel Alfonso Sosa Perez 5h 10m" |
| 213 | R156 | Safety › Hours & Fatigue › Create HOS Violation | D037: Seven visible inputs measured 38px high | CC-3 | DONE-LIVE — Lead live check 11-03 5:00–5:15 PM CT, 1440×900, Owner/USMCA: Create HOS violation 7 inputs 40px |
| 214 | R157 | Compliance › Filings / Overview › Driver labels | D038: Mixed proper-case and uppercase driver labels in populated tables | CC-3 | DONE-LIVE — #28500; Lead live check 11-03 4:47–4:58 PM CT, app.ih35dispatch.com, Owner/USMCA: /compliance "Neftali Coronado Urbano", "Leonel Antonio Morales" |
| 215 | R158 | Driver Profile › Create Driver › Identity step | D039: Fifteen visible inputs measured 38px; CDL state about 199px wide | CC-3 | DONE-LIVE — Lead live check 11-03 5:00–5:15 PM CT, 1440×900, Owner/USMCA: Create Driver identity 15 inputs 40px |
| 216 | R159 | Fleet › Create Trailer › Identity drawer | D040: Seven visible inputs measured 38px high | CC-3 | DONE-LIVE — Lead live check 11-03 5:00–5:15 PM CT, 1440×900, Owner/USMCA: Create Trailer identity 7 inputs 40px |
| 217 | R160 | Insurance › Policies › Create policy step 1 | D041: Eight visible inputs measured 38px high | CC-3 | DONE-LIVE — Lead live check 11-03 5:00–5:15 PM CT, 1440×900, Owner/USMCA: Create policy step 1 8 inputs 40px |
| 218 | R161 | Cash Flow › Projected Auto › Seven-day outlook | D042: Currency abbreviated with k suffix and zero shown without cents | Cursor | MERGED-UNVERIFIED — verify-cash-flow-projected-tab D042 PASS; live UNVERIFIED |
| 219 | R162 | Cash Flow › Projected / Rolling / Manual › Date labels and cells | D043: Day labels and invoice/due cells omit year and use month names | Cursor | DONE-LIVE — #28495; Lead live check 11-03 4:47–4:58 PM CT, app.ih35dispatch.com, Owner/USMCA: "Tue 11/03/2026", invoice "10/05/2026" (residuals: "Fuel est. 2026-11-03", payee "Llc" → live-fails-1) |
| 220 | R163 | Accounting › Home › Settlement / transaction links | D044: Driver/vendor names still all-uppercase | CC-3 | DONE-LIVE — #28500; Lead live check 11-03 4:47–4:58 PM CT, app.ih35dispatch.com, Owner/USMCA: /accounting "Hugo Gaytan $1,543.24", "Fernando Mecor Hernandez $979.45" |
| 221 | R164 | Banking › Home › Drift alert as-of | D045: Raw ISO timestamp rendered, including T and Z | Cursor | MERGED-UNVERIFIED — verify-banking-home-preview-parity D045 PASS; live UNVERIFIED |
| 222 | R165 | Banking › Home › Drift account label | D046: Several alerts show only generic Account rather than the account display name | CC-1 | DONE-LIVE — #28536; Lead live check 11-03 5:00–5:15 PM CT, 1440×900, Owner/USMCA: 15 drift alerts all named (Faro Escrow Reserve, Relay Fuel Wallet, Bank of America · USMCA FREIGHT …) |
| 223 | R166 | Factoring › Home › Ready-to-factor customers | D047: All-uppercase customer names displayed | CC-3 | FAILED-LIVE → reopened — acronyms title-cased ("Fls","Gtm"), "Roar loGISTICS INC"; Lead builder fixing formatCompanyName (live-fails-1) |
| 224 | R167 | Customers › Create Customer › Billing address | D048: State and ZIP each measure 38px high and 209.33px wide | CC-3 | DONE-LIVE — Lead live check 11-03 5:00–5:15 PM CT, 1440×900, Owner/USMCA: State 40px/279w, ZIP 40px/64w |
| 225 | R168 | Customers › Directory › Customer display names | D049: Mixed uppercase and proper-case customer labels | CC-3 | FAILED-LIVE → reopened — "Roar loGISTICS INC", "Dls","Xpr","Mph","Cts"; Lead builder (live-fails-1) |
| 226 | R169 | Inventory › Create part › Unit cost | D050: Money input measures 28px high | CC-3 | DONE-LIVE — #28494; Lead live check 11-03 4:47–4:58 PM CT, app.ih35dispatch.com, Owner/USMCA: Create part Unit cost 40.0px |
| 227 | R170 | 425C › Profiles & Defaults › Company Name | D051: Input measures 30.67px high | CC-3 | DONE-LIVE — #28494; Lead live check 11-03 4:47–4:58 PM CT, app.ih35dispatch.com, Owner/USMCA: 425C Company Name 40.0px |
| 228 | R171 | 425C › History › Filed timestamp | D052: Month/day rendered without zero padding | Cursor | MERGED-UNVERIFIED — #28495; cannot check live: 425C history has 0 reports |
| 229 | R172 | Lists › Names Master › Name column | D053: Mixed uppercase and proper-case customer names | CC-3 | FAILED-LIVE → reopened — "Roar loGISTICS INC", "Ac Trade & Logistics,Llc"; Lead builder (live-fails-1) |
| 230 | R173 | Reports › Custom report builder › Report name | D054: Input measures 26.67px high and 1156.38px wide | CC-3 | PARTIAL — Report name 40px live; "Filter: report_id" on the same screen 26px → live-fails-2 |
| 231 | R174 | Docs › All Entities › Entity names | D055: Mixed uppercase and proper-case driver names | CC-3 | DONE-LIVE — #28500; Lead live check 11-03 4:47–4:58 PM CT, app.ih35dispatch.com, Owner/USMCA: /docs "Leonel Antonio Morales / 13698", "New Era Logistics / 13698" |
| 232 | R175 | Docs › Upload Document › Category/entity/date inputs | D056: Four visible inputs 38px; date fields about 1201px wide | CC-3 | DONE-LIVE — #28494; Lead live check 11-03 4:47–4:58 PM CT, app.ih35dispatch.com, Owner/USMCA: Upload Document 4 inputs 40.0px |
| 233 | R176 | Users › Master-detail › User labels | D057: Repeated generic User labels and mixed name capitalization | CC-3 | FAILED-LIVE → reopened — 14 users listed as bare "User"; Lead builder (live-fails-1) |
| 234 | R177 | Users › Create User › Name/email/role | D058: Three visible inputs 38px high | CC-3 | DONE-LIVE — #28494; Lead live check 11-03 4:47–4:58 PM CT, app.ih35dispatch.com, Owner/USMCA: Create User 3 inputs 40.0px |
| 235 | R178 | Program › Scenario tracker › Certification timestamp | D059: Raw database timestamp with fractional seconds and +00 timezone | Cursor | MERGED-UNVERIFIED — verify-homepage-scenario-tracker-staleness D059 PASS; live UNVERIFIED |
| 236 | R179 | System › Transaction Health › Generated/document dates | D060: Month-name timestamps instead of MM/DD/YYYY | Cursor | MERGED-UNVERIFIED — verify-transaction-health D060 PASS; live UNVERIFIED |
| 237 | R180 | System › Transaction Health › Journal-entry and bill-payment labels | D061: Raw UUIDs are visible display labels | Cursor | MERGED-UNVERIFIED — TXH display_label payee·date·$ / memo strip UUID; live UNVERIFIED |
| 238 | R181 | System › Transaction Health › Wiring preview DR/CR | D062: Currency values lack dollar signs | Cursor | MERGED-UNVERIFIED — txHealthLedgerText formatUsdCents; live UNVERIFIED |
| 239 | R182 | Reports › Scheduled subscriptions › Add subscription timezone | D063: Input measures 30.67px high | CC-3 | DONE-LIVE — Lead live check 11-03 5:00–5:15 PM CT, 1440×900, Owner/USMCA: Add subscription timezone 40px |
| 240 | R183 | Accounting › Create Manual JE › Step 2 Lines | D064: Header summary renders `Date: 2026-10-22`, while Step 1 correctly shows `10/22/2026` | Cursor | MERGED-UNVERIFIED — verify-91105 D064 PASS; live UNVERIFIED |
| 241 | R184 | Accounting › Create Manual JE › Step 2 Lines | D065: Class selector overlaps the adjacent Debit field; line controls overflow the drawer horizontally | Cursor | DONE-LIVE — #28557; Codex batch94 live USMCA 17:14CT after reload: Class/Debit 4px gap at 1280 and 768 (no overlap), drawer 700px, inputs 40px; Cancel only |
| 242 | R185 | Banking › Home / Record Transfer › Drawer footer | D066: Persistent alert stack renders above the open transfer drawer and obscures its bottom action area | Cursor | MERGED-UNVERIFIED — #28498 attention dock z-[50] below ParityDrawer; verify-unmatched-7d plant; live footer UNVERIFIED |
| 243 | R186 | Accounting › Bills / Bill detail › Payments on this bill | D067: Two linked payments render as `Payment — not visible` rather than distinct display identifiers | Cursor | MERGED-UNVERIFIED — #28498 visibleDocumentLabel(ref|check|date·$); verify-bill-detail-panel-visible-label; live USMCA UNVERIFIED |
| 244 | R187 | Accounting › Bill detail › Journal Entity column | D068: Five journal rows show raw UUID entity labels | Cursor | DONE-LIVE — #28502; Lead live check 11-03 4:47–4:58 PM CT, app.ih35dispatch.com, Owner/USMCA: bill journal entity "Carlos Mauricio Pena Carvallo", 0 UUIDs |
| 245 | R188 | Accounting › Reclassify › Account balance heading | D069: Date displays `10/23/26` while date filters use `10/23/2026` | Cursor | DONE-LIVE — #28495; Lead live check 11-03 4:47–4:58 PM CT, app.ih35dispatch.com, Owner/USMCA: "BALANCE 11/03/2026" |
| 246 | R189 | Banking › Categorize / Match › Candidate dates | D070: Loaded candidate list displays YYYY-MM-DD dates while transaction header uses MM/DD/YYYY | Cursor | DONE-LIVE — #28495; Lead live check 11-03 4:47–4:58 PM CT, app.ih35dispatch.com, Owner/USMCA: candidates "09/24/2026", window "08/05/2026 – 02/01/2027" |
| 247 | R190 | Banking › Categorize / Match › Candidate payee labels | D071: Candidate names mix ALL CAPS and proper case | Cursor | DONE-LIVE — #28502; Lead live check 11-03 4:47–4:58 PM CT, app.ih35dispatch.com, Owner/USMCA: match drawer "Payee: Jorge Luis Infante Corona" (residual CSS uppercase on register suggestion line → live-fails-1) |
| 248 | R191 | Banking › Relay card › Wallet balance tile | D072: Five-digit currency omits thousands separator | Cursor | MERGED-UNVERIFIED — AccountTile formatUsd D072; live UNVERIFIED |
| 249 | R192 | Cash Flow › Projected Auto › Expected Expenses driver labels | D073: Driver Bill labels mix ALL CAPS and proper case | Cursor | MERGED-UNVERIFIED — verify-cash-flow-projected-tab D073 PASS; live UNVERIFIED |
| 250 | R193 | Dispatch › Truck Line › Initial data requests | D074: Network capture: truck-line 11,425 ms; units-without-load 4,810 / 8,819 ms; positions/latest 4,193 ms; detention/board 3,217 ms | CC-3 | MERGED-UNVERIFIED — #28567 (Lead): units-without-load 3,081 → 25 ms (was a 566,392-row scan), fallback city 4,349 → 0.14 ms, one pool connection per request, units-without-load fired once (was twice). Live timing after deploy |
| 251 | R194 | Settlements › Open Tours › PU / DEL dates | D075: Rendered dates use OCT-21 / OCT-23 rather than numeric month/day/four-digit year | Cursor | DONE-LIVE — #28495; Lead live check 11-03 4:47–4:58 PM CT, app.ih35dispatch.com, Owner/USMCA: "P-0116 … 10/20/2026 10/26/2026" |
| 252 | R195 | Settlements › Escrow Accounts › Holder labels | D076: One visible holder link says Driver — Not Visible instead of a resolved full name | Cursor | DONE-LIVE — #28502 (Owner); Lead live check 11-03 4:47–4:58 PM CT, app.ih35dispatch.com, Owner/USMCA: closed bond "Alfonso Hidalgo Chavez … closed $0.00" |
| 253 | R196 | Settlements › Escrow Accounts › Updated dates | D077: Date portion uses unpadded month/day before time | Cursor | DONE-LIVE — #28495; Lead live check 11-03 4:47–4:58 PM CT, app.ih35dispatch.com, Owner/USMCA: "10/11/2026, 2:57 AM" |
| 254 | R197 | Maintenance › Road Service / Create Roadside WO › Ticket # and Location inputs | D078: Two single-line dialog text inputs measure 38 CSS px high | CC-3 | DONE-LIVE — Lead live check 11-03 5:00–5:15 PM CT, 1440×900, Owner/USMCA: Roadside WO Ticket # and Location 40px |
| 255 | R198 | Customers › Per-Customer P&L › Classification labels | D079: Visible tags read high_margin and past_due | CC-3 | DONE-LIVE — already fixed by #27574 (shared formatCustomerProfitabilityFlagLabel); guard added #28567 |
| 256 | R199 | Coverage | Codex audit coverage is partial depth — remaining tabs, drawers and record pages of every module still to audit | LEAD | OPEN |
