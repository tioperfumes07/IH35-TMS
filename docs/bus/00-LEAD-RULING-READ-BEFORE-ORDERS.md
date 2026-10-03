# LEAD RULING 09-28-2026 — QBO RETRACTION · 5819 WRONGLY VOIDED · 5817/5818 MISSING · QUICK PAY IS SYSTEMIC
Claude Lead · USMCA `5c854333-6ea5-4faa-af31-67cb272fef80` · measured live from the owner's 09-25-26 Faro
pack and five signed AlwaysTrack PDFs.

## 1. RETRACTION — QUICKBOOKS CANNOT BE USED AS A USMCA A/P SOURCE. CC-1 STEP 2 IS CANCELLED.
Owner, verbatim: "the qbo account was transportation account and because the app was not ready on time,
we began using that account as transportation and usmca, so it is not fully reliable."
The QBO company reads "USMCA Freight Solutions, Inc." but the BOOK inside it is **mixed Transportation
and USMCA**. My Round 143 instruction to read 499 QBO bills and prove the 2026 window clear is WRONG
and is withdrawn — a 2026 bill in there cannot be attributed to an entity by reading it.
**NEW RULE: QuickBooks is REFERENCE ONLY for USMCA. Never an A/P source, never a reconciliation target,
never an import. Write-back stays OFF forever.** If a QBO figure ever contradicts the TMS, the TMS and
the signed document win and the QBO figure is reported, not adopted.

## 2. 5819 IS A REAL SIGNED SETTLEMENT AND IT WAS WRONGLY VOIDED — HIGHEST PRIORITY
App today: `status='cancelled'`, voided, 0 lines, 0 loads, net_pay 0.00.
Void reason on the row: *"R-189A: minted pre-settlement number 5819 (engine call in R-168); its 6 loads
belong to 5 other drivers — emptied and voided"*.
**The signed Company_Settlement_5819 says otherwise:**
```
Start 2026-09-18   End 2026-09-25   Loads 13612, 13617
Invoiced 8,919.72 · Quick Pay -194.09 · Driver Salary -1,905.75 · Fuel -3,482.97
Company Expenses -1,382.65 · Net Revenue 1,904.26
```
Two loads, not six. A real AlwaysTrack document was destroyed on a wrong assumption. Restore it.
Void, never delete, is law — so the restoration is a NEW correctly-built settlement carrying docref
5819, or an un-void through the existing engine. **Never delete the voided row; it is the audit trail
of the mistake.** The owner's law: the source document wins.

## 3. 5817 AND 5818 DO NOT EXIST IN THE APP AT ALL — THE OWNER WAS RIGHT
He said "i believe there are a few more settlments here." He is correct. Neither docref is in
`driver_finance.driver_settlements`. Both are signed:
```
5817  Start 2026-09-18  End 2026-09-25  Loads 13610, 13619
      Invoiced 10,300.00 · Quick Pay -88.50 · Driver Salary -1,667.66 · Fuel -3,799.07
      Company Expenses -62.69 · Net Revenue 4,682.08
5818  Start 2026-09-19  End 2026-09-19  Loads 13609, 13614
      Invoiced  5,950.00 · Quick Pay -51.75 · Driver Salary -1,040.18 · Fuel -3,300.60
      Company Expenses -105.80 · Net Revenue 1,401.67
```
**My earlier G-17 finding — "5817, 5818, 5819 are in the app with no PDF" — was exactly backwards.
The PDFs exist. The app is what is missing. Withdrawn.**

## 4. SIX LOADS CARRY NO SETTLEMENT AND THE PDFS NAME THEIR HOME — $25,879.72 OF LINE HAUL
| load | status | rate | app settlement | SIGNED PDF says |
|---|---|---|---|---|
| 13609 | dispatched | 2,400.00 | none | **5818** |
| 13610 | closed | 5,900.00 | none | **5817** |
| 13612 | closed | 4,900.00 | none | **5819** |
| 13614 | closed | 3,450.00 | none | **5818** |
| 13617 | dispatched | 4,019.72 | none | **5819** |
| 13619 | closed | 5,210.00 | none | **5817** |
13609 and 13617 are still `dispatched` while their settlement document is signed and closed.

## 5. QUICK PAY IS ON EVERY SETTLEMENT — IT IS SYSTEMIC, NOT A ONE-OFF
5812 -232.50 · 5814 -139.50 · 5815 -111.00 · 5817 -88.50 · 5818 -51.75 · 5819 -194.09 = **$817.34**
on six documents alone. Account `4970 Short-Pay — Agreed Concession / Quick-Pay Discount`
(`ca5afa81-5b45-49a5-89b1-17093de39197`) has **ZERO postings**. It appears as a QP % column on
CUSTOMER CHARGES and as a REVENUE deduction. Every settlement print and every revenue tie-out is
wrong until this posts.

## 6. 5814 — $100.00 VARIANCE AGAINST THE SIGNED DOCUMENT
App gross_pay **2,002.65** · signed PDF Driver Salary **1,902.65**. Loads agree (13604, 13608).
Read the document and the two driver bills before changing anything.
5815 TIES exactly: app gross 1,266.10 = PDF 1,266.10.
5816 is an empty shell: closed, 0 lines, gross 0.00, one load 13595, and no PDF in this pack.

## 7. RETRACTION — "ZERO SHORT-PAYS" IS FALSE. THERE ARE THREE, $3,750.00.
From the owner's 09-25-26 debtor receipts report:
```
inv 014 CORE LOGISTICS BROKERAGE  billed 3,500.00  paid 3,250.00  SHORT   250.00
inv 015 DARDINI LLC               billed 3,600.00  paid 2,600.00  SHORT 1,000.00
inv 018 DARDINI LLC               billed 3,900.00  paid 1,400.00  SHORT 2,500.00
```
The standing "zero short-pays, zero chargebacks" line is struck. Short-pay handling must exist.
Resolve-difference reason code: `customer_short_pay_writeoff`.

## 8. FARO IS NOW 104 INVOICES THROUGH 09-25-26 — THE 89 / $311,587.00 CONTROL IS SUPERSEDED
Account summary as of 09-25-26:
```
Payments to You    341,899.39      Debtor Receipts   28,125.00
Discount Fee         5,366.37      Schedule Fee          44.38      Wire Fee   260.00
Ending NFE         319,445.14
AR Balance         329,631.72      Escrow Reserve     5,053.24      Cash Reserve  5,133.34
```
The 8/10–9/21 window and its $311,587.00 stay valid as the FEED scope. The figures above are the
CURRENT Faro position and are what the factoring tie-out must reach.
Also present and never modelled: **Faro internal transfers to IH35 negative reserve** —
09/02 5,000 · 09/09 11,840 · 09/15 8,000 · 09/21 2,000 + 4,135.41 = **$30,975.41 moved out of USMCA
reserve to IH 35**. That is an inter-company movement (8000/8001/8002), not a fee. Nobody has booked it.

## 9. QUICK PAY — RULED. CURSOR'S GATE IS RELEASED. NO NEW GL MATH IS NEEDED.
Cursor stopped at the gate correctly and reported: 4970 has 0 postings, credit-memo reasons
`quick_pay_discount` / `agreed_concession` are data-only with no GL, settlement `quick_pay_cents` is a
derived display read of `SUM(factoring_advances.factor_fee_cents)`, and Faro fees post to role
`factor_fee_expense`. Correct on all four. Here is the ruling.

**THE ARITHMETIC SETTLES IT — Quick Pay IS the Faro discount fee, load by load, to the cent:**
```
doc   printed QP   per-load QP%  vs FARO discount fee
5812     232.50    13588 5,700.00@1.50% = 85.50  faro 85.50 ✓ | 13600 4,900.00@3.00% = 147.00  faro 73.50 ✗
5814     139.50    13604 4,900.00@1.50% = 73.50  faro 73.50 ✓ | 13608 4,400.00@1.50% = 66.00  faro 66.00 ✓
5815     111.00    13605 3,700.00@1.50% = 55.50  faro 55.50 ✓ | 13611 3,700.00@1.50% = 55.50  faro 55.50 ✓
5817      88.50    13610 5,900.00@1.50% = 88.50  faro 88.50 ✓ | 13619 5,210.00@1.50% = 78.15  faro 78.15 ✓ (not in doc total)
5818      51.75    13609 2,400.00@1.50% = 36.00  faro 36.00 ✓ | 13614 3,450.00@1.50% = 51.75  faro 51.75 ✓ (not in doc total)
5819     194.09    13612 4,900.00@1.50% = 73.50  faro 73.50 ✓ | 13617 4,019.72@1.50% = 60.30  faro 60.30 ✓ (total 133.80, doc 194.09)
```
Every per-load figure equals the Faro discount fee EXACTLY. This is not a new cost. It is the
factoring discount, and the app **already books it** — account 6400 Factoring Fees, 233 postings,
DR $8,893.43, via role `factor_fee_expense`.

**RULING: Quick Pay gets NO second posting. It is a PRINT FIELD sourced from the factoring discount
already in 6400.** Posting it to 4970 as well would book the same dollars twice — once as financing
expense and once as a revenue reduction. Under the locked architecture factoring is a SECURED
BORROWING (ASC 860), not a sale, so the discount is a FINANCING EXPENSE. It is not contra-revenue.
CURSOR: render Quick Pay on the print from the per-load factoring discount. Post nothing. Gate released.

**4970 IS NOT UNUSED — IT IS FOR THE REAL SHORT-PAYS, AND WE NOW HAVE THREE.**
inv 014 CORE 250.00 · inv 015 DARDINI 1,000.00 · inv 018 DARDINI 2,500.00 = **$3,750.00**.
THOSE belong in 4970 with reason `customer_short_pay_writeoff`. That is CC-1's, not Cursor's.

**THREE DOCUMENT-LEVEL VARIANCES TO REPORT, NOT TO FORCE:**
- 5812 load 13600 printed at 3.00% ($147.00) where Faro charged 1.50% ($73.50) — $73.50 difference
- 5817 and 5818 each omit one load's discount from the document total (78.15 and 36.00)
- 5819 prints 194.09 where the two loads' discounts sum to 133.80 — $60.29 unexplained
Cursor prints what the document prints. CC-1 investigates the four differences against Faro.
Do not adjust a signed document to make it agree.
