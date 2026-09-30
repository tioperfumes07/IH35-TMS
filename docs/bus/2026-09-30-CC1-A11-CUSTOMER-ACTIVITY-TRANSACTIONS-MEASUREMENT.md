# A-11 — Customers Activity/Transactions measurement (diagnosis only, no fix)

CC-1, 2026-09-30. Measured live against customer `684f5776-403b-422d-bc5e-2b44ae3b6a2c` (16 real,
non-sample USMCA invoices — the customer with the most history).

## The shared backend endpoint checks out correct

Both the customer-detail "Activity" tab (`CustomerFinancialActivityTab`,
`apps/frontend/src/pages/Customers.tsx:346`) and the "Transaction List" tab's headline
"Transactions" mini-table (`customerTxnActivityQuery`, same file, line ~925) call the exact SAME
backend route, `GET /api/v1/accounting/customers/:customerId/activity`
(`apps/backend/src/accounting/customer-activity.service.ts`) — by design (comment VC-DETAIL-01,
owner ROUND 14). Ran the route's own invoice predicate live:

```sql
SELECT i.id, i.issue_date, i.display_id, l.load_number, i.total_cents, i.status
FROM accounting.invoices i
LEFT JOIN mdata.loads l ON l.id = i.source_load_id AND l.operating_company_id = i.operating_company_id
WHERE i.operating_company_id = '5c854333...' AND i.customer_id = '684f5776...'
  AND i.total_cents IS NOT NULL AND i.voided_at IS NULL
  AND i.status NOT IN ('void','voided','draft','proforma','factored')
  AND i.is_sample_data = false
```
Returned **14 rows**. Cross-checked against the raw `accounting.invoices` table for this customer
(21 total rows): 5 void, 2 proforma, 14 sent — 21 − 5 − 2 = 14. Exact match. **The shared endpoint's
invoice logic is correct for this customer.** No discrepancy found here.

## The real, concrete discrepancy — two DIFFERENT queries feed two DIFFERENT tables on the SAME tab

The "Transaction List" tab (`apps/frontend/src/pages/Customers.tsx:1364` onward) stacks THREE
tables, not one:
1. **"Transactions"** mini-table — `customerTxnActivityQuery` → the shared activity endpoint above.
   **No filters applied** (no status/date/type filter passed to the query at all).
2. **"Invoices"** table below it — `invoicesQuery` → `listAllCustomerInvoices(...)`, which DOES
   accept `statusFilter`, `dateFrom`, `dateTo` from the page's own filter bar.
3. A Loads table further below (`loadsQuery`).

**This is the mismatch the owner is almost certainly seeing**: apply any status or date filter on
this tab, and the "Transactions" table (unfiltered) and the "Invoices" table (filtered) will show
DIFFERENT row counts/content for the same customer, on the same screen, at the same time — two
lists that visibly disagree. This is not a backend data-correctness bug; it's a frontend UX defect
where one of two redundant, overlapping tables silently ignores the page's own filter controls.

## Verdict

Not fixed (diagnosis only, per instruction). The Lead should rule on: (a) make the "Transactions"
mini-table respect the same filter bar the "Invoices" table uses, or (b) remove the redundant
"Invoices"/"Loads" tables now that the shared activity endpoint already covers invoices+payments
in one place (the page's own comment suggests they were "preserved, additive" rather than
deliberately kept as a second source of truth).
