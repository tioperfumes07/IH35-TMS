# 09-28-2026 · USMCA GAP REGISTER — NUMBERED · DOCUMENT CREATION ONLY
12:22 PM CT (17:22 UTC) · USMCA `5c854333-6ea5-4faa-af31-67cb272fef80` · Neon `br-fancy-credit-akjnd07a`
Bank reconciliation and bank matching are OUT OF SCOPE by owner order. This register covers
TRANSACTIONS AND DOCUMENTS THAT MUST EXIST, tied to the cent, in the correct accounts and tables.

## WHAT HOLDS — measured, not claimed
| | |
|---|---|
| Ledger balances | DR $2,991,235.43 = CR $2,991,235.43 · **0 unbalanced journal entries** |
| All expenses posted | 517 of 517 · 0 unposted |
| Admin fee income (7200) | net **$952.25** — **equals the PDF total to the cent** |
| Faro control | owner file 89 rows 8/10–9/21 = **$311,587.00** exactly |
| Load → settlement | 78 of 80 agree with the app AND the signed PDFs |
| Loads / settlements present | 81 of 81 · 43 of 43 · zero missing |
| Invoices | 101 · $345,897.00 |
| Driver bills | 120 · $79,959.50 |

## THE GAPS

### G-01 · DOCUMENT EXPENSES ONLY 29% FED — $7,560.60 MISSING
PDF (48 in-scope company settlements): **255 expense lines / $12,764.27**.
App DOOR-1 expenses (`source_settlement_ref` set): **75 / $5,203.67**.
**MISSING: 180 lines / $7,560.60.** Feed from the PDF only. Do not touch the bank.

### G-02 · `accounting.bills` = 0 — THERE IS NO A/P SUBLEDGER
Zero bills exist in USMCA, including voided. Account 2000 A/P shows 170 postings but
DR $5,053.19 = CR $5,053.19 — it nets to zero because expenses pass through it.
A/P has no open items, no aging, no vendor balances. **A/P does not exist as a subledger.**

### G-03 · `accounting.bill_payments` = 0 — CASH ADVANCES POST THE WRONG WAY
Cash advances $2,275.96 post under `source_transaction_type = 'driver_cash_advance'` (24 postings).
CLOSED DECISION: **cash advances are BILL PAYMENTS** (DR 2000 A/P · CR 1000 bank).
A bill payment cannot exist without G-02. G-02 must land first.

### G-04 · SETTLEMENT GL CHAIN HAS NEVER RUN
`driver_settlement_gl_runs` = 0 · `driver_settlement_gl_bills` = 0.
The path that creates the accounting bill, the cash bill payment and the deduction bill payment
for each settlement has not executed once for USMCA.

### G-05 · EVERY SETTLEMENT LINE IS UNCATEGORIZED
311 active in-scope lines. `item_id` NULL on **311**. `posting_account_id` NULL on **311**.
`category` NULL on **311**. There is no category on the line to tie to the PDF.

### G-06 · 1090 UNDEPOSITED FUNDS RESIDUE $150,283.02
DR $546,314.40 / CR $396,031.38. Day-close assertion 14 forbids 1090 residue.

### G-07 · 2510 DREAMLINE DIESEL CARD PAYABLE $149,793.68 OPEN
CR $193,977.22 against DR $44,183.54. The fuel card liability is accruing with almost no payment side.

### G-08 · 9000 ASK MY ACCOUNTANT — 128 POSTINGS, $3,631.73
Uncategorized amounts parked. Every one needs a real account.

### G-09 · ITEM CATALOG DOES NOT MATCH THE PDF
NO ITEM EXISTS: Road Service-Trailer Tire Expense · TRACTOR-Washout Expense ·
Driver Reimbursement-TPE-Scale Expense · Driver Reimbursement-TPE-Toll Expense.
NAME DRIFT: Reefer Trailer-Washout · Warehouse-Lumper **Fee** · Fuel-Reefer Diesel · Road Service-Truck Repair.
WRONG ITEM: OTR-Mexico Tolls & Intl Bridge booked to **Highway Toll Expense-USA** ·
Driver Reimbursement-Fuel-Def booked to Driver Reimbursement-Company Vehicle Fuel.

### G-10 · 31 OF 67 DEADHEAD_PAY LINES ARE $0.00
The PDFs print Empty Miles dollars on those loads.

### G-11 · ESCROW ONE LINE OVER — +$25.00
App 69 lines / $1,725.00 · PDF 68 lines / $1,700.00.
Escrow also shows heavy debits across the 15 per-driver sub-accounts (2100-00-0xx) — releases
that need a reason on every one.

### G-12 · DOC 5812 — $1,702.47 AGAINST THE SIGNED DOCUMENT
`Driver_Settlement_5812` reads Salary 0.00 · Deductions −50.00 · **TOTAL DUE −50.00**.
App net pay **$1,652.47**. Read the document and its loads before changing anything.

### G-13 · $34,210.00 ADVANCED WITH NO LOAD BEHIND IT
11 in-window Faro purchases with no LOAD in the owner reconciliation.
Purchase $34,210.00 · net advance $33,183.70.
inv 7 · 28 · 46 · 84 · 85 · 89 · 90 · 91 · 92 · 93 · and the Refrigerx row whose Inv#/PO are swapped
(should read inv **59** / PO **1013272-2**).

### G-14 · INV 87 / LOAD 13604 / $4,900.00 — NO SETTLEMENT IN THE OWNER FILE
App puts 13604 on **5814**. Confirm against the PDF and close.

### G-15 · TWO OWNER-FILE MAPPING ERRORS (PDF-CONFIRMED)
load 13526 → **5779** (owner file says 5772) · load 13607 → **5813** (owner file says 5816).
The signed PDFs and the app agree. Correct the spreadsheet, not the system.

### G-16 · CHECK CREATOR IS BUILT BUT NOT COMMISSIONED — IT CANNOT PRINT A CHECK
Schema is there: `banking.check_stock_settings`, `check_number_registry`, `check_print_batches`,
`check_print_batch_items`, and expenses carry payment_type / check_number / print_status /
print_batch_id / payee_kind / remit_to_address / print_on_check_name / printed_at.
LIVE STATE: `check_stock_settings` **0 rows** · `check_number_registry` **0 rows** ·
`check_print_batches` **0** · `check_print_batch_items` **0** · checks issued **0** ·
all 517 expenses `payment_type='expense'`, `print_status='not_set'`, 0 check numbers.
No `next_check_number`, no check_type, no print offsets for any bank account.
**ANSWER: NOT COMPLETE. It has never issued a check and today it cannot.**

### G-17 · 3 DOCREFS IN THE APP WITH NO PDF
5817 · 5818 · 5819 (5819 is cancelled / voided). Identify or void with a reason. Never delete.

### G-18 · 6300 BANK SERVICE CHARGES — $174K OF GROSS CHURN FOR $220 NET
DR $174,646.12 / CR $174,426.12. Explain the gross movement before any close.

## ORDER OF WORK — dependencies are real
1. **G-09** item catalog (nothing can be fed correctly until the items exist)
2. **G-01** the 180 missing document expense lines
3. **G-02** bills → then **G-03** bill payments → then **G-04** the settlement GL chain
4. **G-05** categorize the 311 settlement lines · **G-10** the zero deadhead lines
5. **G-08** drain 9000 · **G-06** clear the 1090 residue · **G-07** the Dreamline payable
6. **G-11 · G-12 · G-13 · G-14 · G-17 · G-18** the named investigations
7. **G-16** commission the Check Creator
