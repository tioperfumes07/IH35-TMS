# CC-1 — ROUND 145 — A/P ADOPTION. YOU ARE THE GATE ON ALL MATCHING.
Your guard fix merged (#22883 → 40f58065b5) and unblocked the repo. Good. Now the blocker is A/P.
FAST MERGE is on. Every seat fixes its own blockers — do not hand off, do not wait.

## WHY THIS IS THE GATE
`accounting.bills` = **0**. `accounting.bill_payments` = **0**. CC-2 proved 16 cleared checks tie to a
settlement's net pay to the cent, and found 18 more ($19,329.95) matching nothing in any money table.
**None of them can be matched to anything until bills and bill payments exist.** Matching is blocked
on you, not on the matcher.

## 1 — RESTORE 5819. IT IS A REAL SIGNED SETTLEMENT THAT WAS WRONGLY VOIDED.
Void reason claims "its 6 loads belong to 5 other drivers." The signed Company_Settlement_5819 says
TWO loads: **13612 and 13617**. Invoiced 8,919.72 · Quick Pay -194.09 · Driver Salary 1,905.75 ·
Fuel 3,482.97 · Company Expenses 1,382.65 · Net Revenue 1,904.26.
Restore through the existing engine. NEVER delete the voided row — it is the audit trail of the error.

## 2 — CREATE 5817 AND 5818. NEITHER EXISTS IN THE APP. BOTH ARE SIGNED.
```
5817  2026-09-18 → 09-25  loads 13610, 13619  Invoiced 10,300.00  Salary 1,667.66  Exp 62.69   QP -88.50
5818  2026-09-19 → 09-19  loads 13609, 13614  Invoiced  5,950.00  Salary 1,040.18  Exp 105.80  QP -51.75
```
Six loads carry no settlement and the PDFs name their home: 13609→5818 · 13610→5817 · 13612→5819 ·
13614→5818 · 13617→5819 · 13619→5817. **$25,879.72 of line haul.** 13609 and 13617 are still
`dispatched` while their settlement is signed and closed — fix the status through the existing engine.

## 3 — A/P ADOPTION. LINKAGE, NOT NEW GL.
`payrun_gl_runs` = 47: `closeSettlementPayRun` claimed every settlement and posted ONE JE with no bill
and no bill payment. `postSettlementBillPayment` refuses because pay-run close already claimed them.
Build ADOPTION — do NOT reverse 47 correct JEs:
- `accounting.bills`, one per driver_bill (120 active), with **`driver_id` POPULATED** (the code
  comment at ~line 615 admits it is left NULL — fix it here)
- `load_id` on `accounting.bill_lines` (bills has no load_id — comment ~line 637)
- cash bill_payment + non-cash deduction bill_payment (`settlement_deduction_noncash`)
- `driver_settlement_gl_runs` + `driver_settlement_gl_bills` linking settlement → driver → vendor →
  driver_bill → load → bill → bill JE → both payments
- **POST NO NEW JOURNAL LINES.** Link to the JEs that exist. If a bill cannot be linked to an existing
  balanced JE, STOP AND REPORT. No seventh engine.
- idempotent on (operating_company_id, settlement_id) and (run_id, driver_bill_id)
Cash advances ($2,275.96, posting today as `driver_cash_advance`) become BILL PAYMENTS via `payBill`
(bills.service.ts:2764). NEVER `applyToBill` (does not update paid_cents, ACCT-F5691).

## 4 — THE 18 UNMATCHED CLEARED CHECKS — $19,329.95. YOURS.
1004 1,952.75 · 1006 1,288.79 · 1008 979.05 · 1010 850.00 · 1011 1,006.26 · 1020 1,307.10 ·
1021 953.13 · 1024 1,450.00 · 1025 1,150.00 · 1026 360.39 · 1031 1,006.26 · 1032 875.00 ·
1033 890.00 · 1041 1,617.66 · 1044 1,015.43 · 1045 953.13 · 1046 750.00 · 1047 925.00
Real bank outflow with no document anywhere in the TMS. Identify what each paid. Do not guess.

## 5 — 5814 VARIANCE $100.00
App gross_pay 2,002.65 vs signed PDF Driver Salary 1,902.65. Loads agree (13604, 13608). Read the
document and the two driver bills first.

## 6 — THREE REAL SHORT-PAYS, $3,750.00 — 4970 IS WHERE THEY BELONG
inv 014 CORE 250.00 · inv 015 DARDINI 1,000.00 · inv 018 DARDINI 2,500.00.
"Zero short-pays" is struck. Reason code `customer_short_pay_writeoff`.

## SCOPE — USMCA ONLY
Do not read, touch or report on Transportation (91e0bf0a) or Trucking (b49a737b). Inter-company is
CANCELLED — the owner categorizes it himself. QuickBooks is REFERENCE ONLY, never an A/P source; the
owner confirmed that account carried both entities. Write-back stays OFF forever.

## PROOF
5819 restored · 5817 and 5818 live · six loads on their settlements · bills 120 · bill_payments > 0 ·
gl_runs 47 · gl_bills > 0 · ledger UNCHANGED at DR 2,991,235.43 = CR 2,991,235.43, 0 unbalanced.
