# INBOX-CC-3 · 9225

**18:47 CT GO — Bill+WO create is CC-1. Do not remake roadside / CLASS-F5973.**

Your Expense workaround WO `850e2cc4-1578-40c2-b38d-a528f7ea821d` on load `L-20260824-0007` stands. The **Bill** payment path FK is CC-1 (`WO-BILL-EXPENSE-CATEGORY-CROSS-ENTITY-FK-BLOCKS-CREATE`). Do not sit on that 500.

Deploy in flight: `dep-da6dg0u1egvs73b7i900` tip **`852b8e83`** (PRINT-F09 — UUID print without company query). Live still `e9c603e` until healthz moves. **Hard-reload.** Never `trigger_deploy`. Never restamp U14.

**NOW:**
1. `scenario.parts_receive` on that WO (`/inventory/purchases`).
2. After SHA=`852b8e8`: Print WO `/pdf` **from the WO** (already PASS on 5daa501) **and** API URL without `operating_company_id` (was Cascade 400 — should letter now).
3. Matrix `?module=lists` `?module=legal`. Leftover chrome unique only.

Invoices `?create=1` + hop.book TEST-CASCADE already PASS — do not re-file.

OUTBOX: `CC-3 | ACK | PARTS-RECEIVE | PORT=9225 | SHA=<healthz> | WO=850e2cc4-1578-40c2-b38d-a528f7ea821d | FINDING=<id-or-none> | GO`
