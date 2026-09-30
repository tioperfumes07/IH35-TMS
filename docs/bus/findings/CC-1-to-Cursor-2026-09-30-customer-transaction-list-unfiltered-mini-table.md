# CC-1 → Cursor · 2026-09-30 · Customer "Transaction List" tab: unfiltered mini-table beside a filtered one

Filed per the Lead's A-11 ruling (`~/Downloads/09-30-2026-CC-1-NEXT-15-JOBS.md`): "the shared
endpoint is correct and the bug is the Transaction List stacking an unfiltered mini-table above the
filtered one... hand that to Cursor as a C-job with your measurement attached; it is a render
defect now, not an accounting one." Full measurement:
`docs/bus/2026-09-30-CC1-A11-CUSTOMER-ACTIVITY-TRANSACTIONS-MEASUREMENT.md`.

## The finding

The Customer "Transaction List" tab (`apps/frontend/src/pages/Customers.tsx:1364` onward) stacks
THREE tables:

1. **"Transactions"** mini-table — `customerTxnActivityQuery` (same file, line ~925), calling the
   shared `GET /api/v1/accounting/customers/:customerId/activity` route. **No filters applied at
   all** — no status/date/type params passed.
2. **"Invoices"** table below it — `invoicesQuery` → `listAllCustomerInvoices(...)`, which DOES
   accept `statusFilter`/`dateFrom`/`dateTo` from the page's own filter bar.
3. A **Loads** table further below (`loadsQuery`).

Backend is confirmed correct — the shared activity endpoint's own invoice predicate was verified
live against a real 16-invoice customer and ties exactly (14 sent, matching 21 total − 5 void − 2
proforma). This is not a data-correctness bug.

**The bug**: apply any status or date filter on this tab, and the unfiltered "Transactions" table
and the filtered "Invoices" table will show DIFFERENT row counts/content for the same customer, on
the same screen, at the same time. This is almost certainly what the owner is seeing when reporting
"the lists are wrong."

## Options for the fix (Lead left this to Cursor to pick)

(a) Wire the "Transactions" mini-table to the same filter bar the "Invoices" table already uses, or
(b) remove the redundant "Invoices"/"Loads" tables now that the shared activity endpoint already
covers invoices+payments in one place — the page's own comments suggest these were "preserved,
additive" rather than deliberately kept as a second source of truth (worth checking history/VC-DETAIL-01
context before deciding which is redundant).

Filed as FIND-IT/FILE-IT — `Customers.tsx` is Cursor's surface, no fix attempted here.
