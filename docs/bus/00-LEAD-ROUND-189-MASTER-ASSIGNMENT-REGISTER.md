# ROUND 189 — MASTER ASSIGNMENT REGISTER — EVERY OPEN ITEM, EVERY SEAT
2026-09-28, Laredo Central. **Lead admission: the G-01…G-18 register written at 01:33 today was
dropped from tracking. G-18 is the $174K wire-fee churn Lead "found" again at 15:45 — it was
already documented 14 hours earlier. This register exists so nothing else is lost.**

---
# CC-1 — ACCOUNTING CORRECTNESS. THE POSTING ENGINE IS YOURS.
| # | Item | Detail |
|---|---|---|
| 1 | **G-18 / wire-fee leg swap** | 71 debit lines $174,666.12, largest $6,644.50; a wire fee is $10. FAC-2026-00065: header advance $10.00, posted to wire-fee acct $5,325.00. **Legs swapped.** 48 reversals credit $174,436.12 back so the TB still squares. Scope FAC-2026-000xx; 00135–00142 correct. Find the commit. **Do not repost until reported.** |
| 2 | **G-06** | 1090 Undeposited Funds residue **$150,283.02** (DR $546,314.40 / CR $396,031.38). Day-close assertion 14 forbids residue. |
| 3 | **G-08** | 9000 Ask My Accountant — 128 postings, **$3,631.73** uncategorized. Every one needs a real account. |
| 4 | **G-07** | 2510 Dreamline Diesel Card Payable **$149,793.68** open (CR $193,977.22 vs DR $44,183.54). Liability accruing with almost no payment side. |
| 5 | Guard | `verify-factoring-posting-legs-match-header.mjs` — every posted leg equals its header field. |
| 6 | Guard | `verify-load-boards-agree.mjs` — Truck Line / List / Load Costs / dispatch return the same set from `canonical-active-load-set.ts`. Today 13624–13639. |
| 7 | Guard | Cash flow reads the delivery date (all 16 invoices `issue_date = due_date = delivery`; 13635/13637 on 10-01, 13630/13634 on 09-30). |

---
# CC-2 — THE A/P SUBLEDGER AND THE DATA. DEPENDENCY ORDER IS REAL.
| # | Item | Detail |
|---|---|---|
| 1 | **G-09 FIRST** | Item catalog does not match the PDF. **Nothing can be fed correctly until the items exist.** MISSING: Road Service-Trailer Tire Expense · TRACTOR-Washout Expense · Driver Reimbursement-TPE-Scale · Driver Reimbursement-TPE-Toll. NAME DRIFT: Reefer Trailer-Washout · Warehouse-Lumper **Fee** · Fuel-Reefer Diesel · Road Service-Truck Repair. WRONG ITEM: OTR-Mexico Tolls booked to Highway Toll Expense-**USA**; Driver Reimbursement-Fuel-Def booked to Company Vehicle Fuel. |
| 2 | **G-01** | **180 document expense lines / $7,560.60 missing.** PDF has 255 lines / $12,764.27; app has 75 / $5,203.67. Feed from the PDF only. Do not touch the bank. |
| 3 | **G-02** | `accounting.bills` = **0**. There is no A/P subledger. No open items, no aging, no vendor balances. |
| 4 | **G-03** | `accounting.bill_payments` = **0**. Cash advances $2,275.96 post as `driver_cash_advance`. CLOSED DECISION: cash advances are **BILL PAYMENTS** (DR 2000 A/P · CR 1000 bank). Needs G-02 first. |
| 5 | **G-04** | Settlement GL chain has **never run**: `driver_settlement_gl_runs` = 0, `driver_settlement_gl_bills` = 0. |
| 6 | **G-05** | All **311** settlement lines uncategorized — `item_id`, `posting_account_id`, `category` all NULL. |
| 7 | **G-10** | **31 of 67** `deadhead_pay` lines are $0.00 while the PDFs print Empty Miles dollars. |
| 8 | Expenses | `accounting.expenses` = 0 on all 16 current loads. |
| 9 | Fuel feed | Dead since **2026-09-24**. Import gap, not linkage (all 450 rows load-linked). Name the cause, fix, import 09-25 → today. From the PROVIDER statement, never a bank description. |
| 10 | Four exports | `09-25-26-*.xlsx` — EXPENSES (94) · ADD PAYMENT (52) · DEDUCTIONS (55) · CUSTOMER CHARGES (65). **Idempotent** — 532 expenses exist; key on Invoice/Load/Settlement #. |
| 11 | Load Costs | Must render complete for all 16 — revenue, driver pay, fuel, expenses, margin. |
| 12 | Guard | `verify-close-recalculates-bills-from-real-mileage.mjs` (step 11687 reserved). |

---
# CC-3 — TRUCK LINE, ALL LOAD BOARDS, SETTLEMENT UI. 18 HOURS OPEN.
| # | Item | Detail |
|---|---|---|
| 1 | Status dropdown | Stays open on click-away. Close on outside pointerdown, Escape, blur, selection. **Second report — write the regression test.** |
| 2 | Truck Line design | Someone moved it off the agreed design. `git log -p` component + CSS, **name the commit**, restore. Do not redesign from taste. |
| 3 | Columns | **Truck \| Tour/Pre-settlement \| Load number** must separate. `TourLegsCell.tsx:78-91` puts the whole legs array in one cell — one column per leg. |
| 4 | Timeline | Proportional to real elapsed time, first pickup → last delivery. **13635 = 6 days vs 13626 = 1 day must render differently.** |
| 5 | **P-series identity** | Root cause found by CC-3: commit **b74c291d4c** (R-186/R-186.1 Settlement Creator) **bypassed the canonical settlement-number allocator**. Pre-settlement number = settlement number = tour number, ONE identity. 14 open render **PENDING**. P-0015/16/17 are closed settlements **5817/5818/5819** — show `source_document_ref`. Set first/last_load_number at mint. |
| 6 | **G-17** | 3 docrefs with no PDF: 5817 · 5818 · 5819 (5819 cancelled). Identify or void with a reason. **Never delete.** Also the 5819 duplicate — report, do not merge. |
| 7 | HOS in List view | `*_hours_remaining` holds **MINUTES** (660/840/4200). `duty_status` empty on all 16 drivers. |
| 8 | The 48-row dash | `settlementNumber.ts` reads `source_document_ref ?? settlement_number`; `CompanySettlementListRow` has only `display_id`. Fix accessor **and** tighten the type. |
| 9 | Itemization | Four ParityTables, **fuel first**. `tokens-load-detail.css:155` is 2 columns; `CompanySettlementItemizedByLoad.tsx:206` joins vendor+description into one span. Resizable, colour tokens, Live location City/ST. |
| 10 | Print + PDF | Driver **and** company settlements, AlwaysTrack layout. |
| 11 | Guard triage | Post the ~14 unattributed guard failures to their **owning seats by name**. `d4985591bb` (check-engine) → Cursor. |

---
# CURSOR — MATCH ENGINE, RESOLVE, CHECKS.
| # | Item | Detail |
|---|---|---|
| 1 | Bulk accept | Every counterparty — BoA, Dreamline, Relay. 911 bank lines. Auto-accept only on amount exact + inside `MATCH_WINDOW_STEPS` + payee sim ≥ 0.5 + unambiguous + **zero variance**. Rest → Resolve. Never outside the accept handler. |
| 2 | Faro | Deterministic. 22 of 25 batches equal their wire exactly. Three to Resolve: 08/13 −$1,800.00 · 08/14 −$5,441.00 · 09/21 −$6,135.41. |
| 3 | Resolve | Running remainder always visible, re-rank per pick, remainder zero or **named** (Reserve Deposit, Client Payable, Discount Fee, Wire Fee, Schedule Fee, Chargeback). Never a generic adjustment. Cash basis recognized at the bank line's date. |
| 4 | **G-16 CHECK CREATOR** | Schema exists; **`check_stock_settings` 0 rows · `check_number_registry` 0 · `check_print_batches` 0 · checks issued 0 · all 517 expenses `print_status='not_set'`.** No next_check_number, no check_type, no print offsets. **It has never issued a check and today it cannot.** Commission it. Owner has raised this repeatedly. |
| 5 | **G-13** | **$34,210.00 advanced with no load behind it** — 11 Faro purchases: inv 7 · 28 · 46 · 84 · 85 · 89 · 90 · 91 · 92 · 93 and the Refrigerx row with swapped Inv#/PO (reads inv **59** / PO **1013272-2**). Net advance $33,183.70. |
| 6 | **G-14** | inv 87 / load 13604 / $4,900.00 — no settlement in the owner file. App puts 13604 on **5814**. Confirm against the PDF and close. |
| 7 | **G-15** | Two owner-file mapping errors, PDF-confirmed: load 13526 → **5779** (file says 5772); load 13607 → **5813** (file says 5816). **Correct the spreadsheet, not the system.** |
| 8 | Guard cleanup | `d4985591bb` (ACCT-F154 check engine) broke verify-acct-posting-business-date, verify-money-create-tags-sample-data, verify-schema-parity, verify-sql-column-existence, verify-void-predicate-map-current. Yours. |

---
# LEAD (me)
G-11 escrow +$25.00 one line over · G-12 doc 5812 $1,702.47 vs the signed document (reads Salary 0.00 / Deductions −50.00 / TOTAL DUE −50.00; app net $1,652.47) · keep this register current · verify every DONE claim live before it reaches the owner.

## STANDING
No creating anything new without owner confirmation. No removing functions or guards.
Closed forever: settlements 5769–5819 tie exactly · 5753/5760–5768 are Transportation ·
Rafael is salaried · the 450 import fuel rows are not duplicates.
