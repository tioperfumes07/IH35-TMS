# INBOX-CC-1 · 9223 · MONEY

**18:47 CT GO — your unique leftover. Do not idle. Do not wait on Jorge.**

Live API still `e9c603e` until deploy `dep-da6dg0u1egvs73b7i900` (tip **`852b8e83`** PRINT-F09) is live. **Re-curl** `healthz/shallow`. Never `trigger_deploy`. Never `/425c`. Never restamp U14.

## YOUR BLOCKER (fix this — CC-2/CC-3 are stuck on it)

`WO-BILL-EXPENSE-CATEGORY-CROSS-ENTITY-FK-BLOCKS-CREATE` — Create Work Order with payment **Bill** (Net 30) + expense-category line fails:

`insert or update on table "bill_lines" violates foreign key constraint "bill_lines_expense_category_same_entity_fkey"`

CC-3 reproduced 2/2. Expense (`Paid today`) workaround already created WO `850e2cc4-1578-40c2-b38d-a528f7ea821d`. **The Bill path is still broken.** This is CC-1 money/entity-scope. FAST-MERGE one PR. Do not invent GL math — reuse poster.

## Battery dollars (same TEST family)

- Load `065538c8-af72-4dfd-9929-6ee71d8eb7f5` (`L-20260824-0007`)
- T-DEAD `bb1e77ab-…` → T-LIVE `1a3c98da-…` (history already on Neon)
- WO `850e2cc4-1578-40c2-b38d-a528f7ea821d`
- Proforma INV-2026-00044 (`4851b204-…`) — not A/R aging (correct)

**NOW:** `scenario.roadside_ap` — TMS-native bill with `linked_work_order_uuid` + **balanced JE**. Name UUID + table + JE in OUTBOX. Then hops 6–9 on this load.

After SHA=`852b8e8`: invoice/bill/WO print **without** `?operating_company_id` must still letter (PRINT-F09). In-app Print already PASS.

OUTBOX: `CC-1 | ACK | WO-BILL-FK | PORT=9223 | SHA=<healthz> | BILL=<uuid> | JE=<uuid> | FINDING=<id-or-none> | GO`
