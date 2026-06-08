# UNIFIED_BLUEPRINT_ADDITIONS.md — append this dated section

## 2026-06-07 — CASH FLOW page locked (daily prediction + Actual vs Projected report)

STATUS: APPROVED BY JORGE (page layout locked 2026-06-07). ADDITIVE ONLY. New page; nothing removed.

### Navigation
- New TOP-LEVEL sidebar item "CASH FLOW".
- Position: BETWEEN "eld / ELD" and "accounting / ACCTG".
  (In the live 22-item order with Insurance at 8: ... 9 ELD, 10 CASH FLOW, 11 ACCTG ...)
- One block = one concern. Do NOT bundle with the Insurance sidebar block.
- After both Insurance (index 8) and Cash Flow are inserted, re-bump verify-architectural-design.ts module count accordingly.

### Purpose
A forward-looking DAILY cash position: for a selected day, predict TRUE income and TRUE expenses
so the owner sees real net before it happens. Read-only over existing data + manual add-ins.

### Page — /cash-flow  (default tab: Daily prediction)
- Date navigator: prev / selected date / next / "Today".
- KPI row (3): Expected income · Expected expenses · Predicted net (green if >=0, red if <0).
- Two panels:
  - EXPECTED INCOME — from loads DELIVERING on the selected day:
    - one row per delivering load: load #, customer, delivery time, amount, basis tag (Confirmed | Predicted | Adjustment).
    - "Confirmed" = delivered/invoiced; "Predicted" = scheduled/in-transit ETA that day; "Adjustment" = detention/accessorial/etc.
    - Income basis amount: USE RATE-CONFIRMATION amount (gross). (Net-of-factoring is shown in the A-vs-P report, see below.)  <-- CONFIRM with Jorge if gross vs net default.
    - Subtotal.
  - EXPECTED EXPENSES — for the selected day:
    - Driver pay: ACCRUES ON DELIVERY (each load delivering that day contributes its driver pay). Basis tag "Driver pay".
      NOTE vs VQ5: VQ5 says driver settlement = bank settle date for ACCRUAL/settlement. Cash-flow PREDICTION shows the
      pay on the DELIVERY day as the expected cash event; the locked toggle below resolves which date drives the cash line.
    - Bills due that day (AP with due_date = selected day), incl. insurance scheduled bills, fuel, factoring fees.
    - Manually added items (see input).
    - Subtotal.
- "+ Add bill or expense" inline input (label + amount + Add) → appends to expenses, recomputes net live.
  Persisted as a cash_flow manual adjustment row (date-scoped), audit-logged. ARCHIVE never DELETE.
- Net bar: Predicted net cash flow for the day.

### OPEN TOGGLES (lock with Jorge before build)
1. Predicted invoice amount = GROSS (rate confirmation) [default] OR NET-OF-FACTORING (what hits the bank).
2. Driver pay cash line = DELIVERY DATE [shown] OR SETTLEMENT DATE (per VQ5). Provide a setting; default DELIVERY for prediction view.
3. Optional: opening cash + projected closing balance on the day (running bank position). Jorge to confirm add.
4. Optional: 7-day strip of predicted net. Jorge to confirm add.

### NEW — Actual vs Projected report (tab on the Cash Flow page)
- Same date (or date-range) picker.
- For each line that was PREDICTED, show PROJECTED vs ACTUAL vs VARIANCE:
  - Income: projected (rate conf) vs actual (invoiced/received), variance $ and %.
  - Expenses: projected (bills due + accrued driver pay) vs actual (bills paid + settlements posted), variance.
  - Net: projected net vs actual net, variance.
- Accuracy summary: how close the prediction was (variance %), so predictions improve over time.
- Pulls actuals from accounting (invoices/payments, bills/bill_payments, settlements posted). Read-only. Accrual vs cash basis respects VQ7 (frontend default Accrual).

### Data sources (all reads through existing services; NO new financial code)
- Income: dispatch loads delivering on date + accounting invoices/adjustments.
- Expenses: accounting bills (due_date), driver_finance accrued pay on delivery / settlements, insurance scheduled bills.
- Actuals: accounting payments/bill_payments, settlements posted_at.

### Acceptance (locked)
1. New page at index between ELD and ACCTG; nothing removed.
2. Daily prediction: income from delivering loads, expenses from bills + driver pay on delivery, live net.
3. Inline add expense/bill persists (date-scoped, audit).
4. Actual vs Projected report tab with per-line variance + accuracy summary.
5. All data via existing services; read-only except the manual add-in rows.
