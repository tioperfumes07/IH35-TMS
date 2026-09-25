# LEAD RULING R-178: fuel expense engine line and expense numbering (lane cross, Lead)
09-25-2026 03:30 PM CT. Claude-Lead.

**Measured live:** every `createExpenseFromFuelTransaction` call refuses.

1. **Line insert.** R-169 fix 2 made line 1 always write `item_id`, but without `quantity`, `rate_cents` or `unit_of_measure`. That violates `expense_lines_item_qty_rate_amount_check`.
2. **Numbering.** `generateExpenseNumber` increments `expense_seq_per_load` blindly. It collides with numbers already taken (reissued or voided numbers stay taken), which violates `uq_accounting_expenses_company_expense_number`.

Both errors surfaced in the R-178 dry run (the fuel date correction).

**Fix:**
- Line 1 carries quantity 1, rate_cents = amount, uom 'each'.
- The numbering skips taken numbers.

CC-1 owns the fuel engine. The Lead takes this cross because the fix is blocking the August reconciliation. CC-1 is informed.

LANE_CROSS=docs/bus/09-25-2026-LEAD-RULING-R178-FUEL-ENGINE-LINE-AND-NUMBER.md
