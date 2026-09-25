# DEVIN-A · ROUND 180 · COMPANY + DRIVER SETTLEMENT CREATOR (one page) · BUILD IT COMPLETE
Issued 09-25-2026 04:24 PM CT (21:24Z) by Claude-Lead. Taken over from CC-3, who stays on the load boards (R-173 Part 1). **Deadline: 09-26-2026 16:00 UTC.** If missed, CC-3 takes it after Part 1.

Read first:
- `docs/bus/09-25-26-handoff-READ-FIRST.md` §0 (laws), §2 (rulings), §5 (reconciliation logic).
- The project doc `claude/00-USMCA-RECONCILIATION-CLOSED-NEVER-ASK-AGAIN.md` §4–§7 (settlement grammar, cash advances = bill payments, escrow, admin fee 7200, reimbursed vs company expense flags).

USMCA only. EXISTING ENGINES ONLY, no second posting path. Branch prefix `devin-a/`. FAST-MERGE with the DoD template. No production data writes from your seat: ship code, guard and tests. The Lead runs the owner's first live entry with you.

The owner types from the AlwaysTrack Company and Driver Settlement PDFs, 3–4 minutes per settlement. Every section mirrors the PDF so he can type top to bottom.

## STEPS (in order, proof per step)
The owner types from the AlwaysTrack Company and Driver Settlement PDFs in 3–4 minutes per settlement. It is a full engine: everything posts and links. No second posting path; it calls the existing engines.
7. **Entry.** Add "Settlement Creator" to + Create (under Drivers), and add a button on Settlements. The route is `pages/settlements/SettlementCreatorPage.tsx`: a mid modal with a right side panel for the preview.
8. **Header fields, typed in PDF order:**
   - Settlement No. · Driver · Truck (unit) · Trailer (`mdata.equipment` by `equipment_number`) · Start date · End date.
   - Then one repeatable "Load" block per load in the tour.
9. **Load block:**
   - Load No. · Customer · Pickup date + city · Delivery date + city (blank = not delivered).
   - Line haul miles / rate / amount · Accessorials (items).
   - Factoring: Faro USMCA / Faro Transportation / Direct (not factored) · Date sent to factoring.
   - Loaded miles · Empty miles · Picks · Drops.
   - Everything else about the load is optional.
10. **Company settlement sections, identical to the PDF:**
    - Customer Charges;
    - Fuel Purchases (date, vendor, location, invoice, gallons, CPG, receipt, fees, discount, and the card: Dreamline or Relay);
    - Expenses (date, item, description, amount, and the load it belongs to);
    - Deductions, Reimbursements, Escrow, Advances;
    - Totals.
11. **Driver settlement sections, identical to the driver PDF:**
    - mileage pay (loaded + empty, at the rate);
    - extra pay lines;
    - deductions;
    - advances (bill payments);
    - escrow;
    - net pay.
12. **Live preview (side panel).** Every JE line with its account name, Dr and Cr, per load, plus these control totals:
    - Company EXPENSES total = the PDF total;
    - Driver net = the PDF net.

    Post stays disabled until both are equal and Dr = Cr.
13. **Post (one transaction, all or nothing).** It uses the existing engines:
    - (a) Load: create it, or match it by load number → `mdata.loads`, with customer, driver, unit, trailer and dates.
    - (b) Delivered → Invoice (Dr A/R, Cr revenue). Not delivered → Pre-invoice, shown in Cash Flow as expected A/R.
    - (c) Factored → the Faro purchase on the date sent (Dr the Faro receivable / escrow / discount expense, Cr A/R), on the correct Faro account for the entity.
    - (d) Fuel → `fuel.fuel_transactions`, then `createExpenseFromFuelTransaction`, Cr the card rail (2510 Dreamline / 1295 Relay).
    - (e) Expenses → the item account (per the handoff §2 table), Cr the card rail. NEVER Cr A/P.
    - (f) Driver bill → mileage only, on the driver payable.
    - (g) Extras and deductions → settlement lines.
    - (h) Escrow → the liability.
    - (i) Advances → `createDriverCashAdvanceCore`, as bill payments.
    - (j) Pre-settlement link → `linkLoadToPresettlementAfterAssignmentInClientTx`. The tour closes into the Settlement when the settlement is closed.
    - (k) `appendCrudAudit`, plus `docs.files` for an optional PDF upload.
14. **Idempotent.** Entering the same Settlement No. again opens it for EDIT. Edit = void and repost. No duplicates.
15. **Everything appears everywhere:**
    - Company Settlements, Driver Settlements, Pre-Settlement;
    - all 5 load boards, Load Costs;
    - Invoices, Factoring, Cash Flow;
    - Driver, Unit, Trailer, Customer and Vendor profiles;
    - GL, trial balance, A/R and A/P aging.
16. **Guard:** `scripts/verify-settlement-creator-ties-document.mjs`. For every creator-posted settlement it checks the company expenses, the driver net, the JE balance, the links, and that nothing credits A/P.
17. **Merge, then owner test.** FAST-MERGE. The owner enters ONE real settlement in Chrome. Paste:
    - the rows created;
    - the JE lines;
    - the parity line for that document;
    - the screenshots of the load board and the pre-settlement.

    Only then is it DONE.

**Extra rules:**
- The EXPENSES rows carry the two PDF flags, **Reimb. (Drv)** and **Comp. Exp. (Y)**.
  - Comp. Exp. → credit the card rail.
  - Reimb. → the driver was paid back on his settlement (Driver Reimbursed Expenses). Never 1000 cash.
- Cash advance lines → `createDriverCashAdvanceCore` linked to the driver bill (a bill payment).
- Admin fee → 7200 income.
- Escrow for claims → the driver escrow liability sub-account.
- Fuel lines → `fuel.fuel_transactions` on the PDF DATE, then `createExpenseFromFuelTransaction`.
