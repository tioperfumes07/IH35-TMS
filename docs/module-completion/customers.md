# Module completion — Customers

**PROGRESS: 10 of 10** · complete: `true` · as_of: 2026-08-09T01:44:37.950Z · live_sha: `—`

| Status | Count |
|---|---:|
| PASS | 10 |
| HOLD | 0 |
| OPEN | 0 |
| FAIL | 0 |
| UNVERIFIED | 0 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `CUST-S01` | **PASS** | /customers roster density matches Neon active customers | 2026-08-03 Cursor Neon lucia (br-fancy-credit-akjnd07a): active deactivated_at IS NULL → TRANSP 1243 · TRK 1446 · USMCA 1 (matches auditor TRANSP 1243). Backend customers.routes status=active filters deactivated_at IS NULL. Guard verify-cust-s01-roster-density-filter + step 2232. | — |
| `CUST-S02` | **PASS** | Customer detail Transaction List ties to accounting.invoices | 2026-08-03 Cursor: Customers.tsx transaction_list calls listInvoices(companyId). Neon lucia accounting.invoices count=11981 all with customer_id. Guard verify-cust-s02-transaction-list-invoices + step 2234. | — |
| `CUST-S03` | **PASS** | Nine follow-up tabs render honest COMING_STATE_COPY (not silent empty) | 2026-08-03 Cursor: COMING_STATE_COPY has 9 keys (activity_feed…conversations) each naming missing endpoint/source + follow-up; CustomerTabComingState renders copy. Guard verify-cust-s03-coming-state-copy + step 2228. Auditor scaffold already PASS; ratchet locks it. | — |
| `CUST-CHROME-01` | **PASS** | Edit vs New transaction ActionButton visual parity on list header | 2026-08-03 Cursor: Customers master-detail header Edit is Button variant=secondary className=h-8 beside primary New transaction (was ActionButton text-link). Vendors sibling same. Guard verify-cust-chrome-header-action-parity + step 2224. data-testid customer-header-edit / customer-header-new-transaction. | — |
| `CUST-CHROME-02` | **PASS** | Edit button treatment consistent list vs CustomerDetail header | 2026-08-03 Cursor: Customer details tab Edit (data-testid=customer-details-edit) uses the same Button variant=secondary chrome as list-header Edit — no ActionButton dual path. CustomerDetail page Edit remains primary Button for inline edit-mode (different action). | — |
| `CUST-CHROME-03` | **PASS** | ParityTable column resize affordance discoverable | 2026-08-03 Cursor: ParityTable col-resize is w-2 opaque slate-200/90 + grip + title tooltip + data-testid=parity-table-col-resize (was ~w-1.5 gray-300/80 hard to see). Guard verify-parity-table-resize-affordance + step 2226. | — |
| `CUST-LINK-01` | **PASS** | Customer → invoice → invoice_lines chain (system-wide SS-005) | 2026-08-04 Cursor: Neon lucia invoices=11981 · invoice_lines=5 (sparse — no backfill this PR). Customers.tsx transaction_list EntityLink kind=invoice + onRowClick → /accounting/invoices/:id; InvoiceDetailPage getInvoice + data-testid=invoice-lines-honest-empty names sparse invoice_lines when lineCount=0; draft retains + Create Line. Guard verify-cust-link-01-invoice-lines-honest + step 2352. | — |
| `CUST-LINK-02` | **PASS** | COI Requests tab honest when insurance.coi_request=0 | 2026-08-03 Cursor: Neon prod br-fancy-credit-akjnd07a SET app.bypass_rls=lucia → insurance.coi_request count=0 AND n_live_tup=0 (true empty). CoiTab emptyText="No COI requests yet…" + Create COI retained. Guard verify-cust-link-02-coi-honest-empty + step 2230. | — |
| `CUST-VERIFY-01` | **PASS** | Customers module VERIFY-1..8 TRANSP + USMCA | 2026-08-04 Cursor: meta guard verify-cust-verify-01 composes S01 roster (TRANSP 1243/USMCA 1 lucia deactivated_at filter), S02 transaction list, S03 coming-state copy, CHROME-01 header parity, LINK-01 honest invoice line-empty, LINK-02 COI honest empty; manifest /customers + /customers/:id. Step 2254. Was 9 of 9 until LV-001 Relationship Health FAIL opened M to 10. | — |
| `LV-001` | **PASS** | Relationship Health 500s on every customer — PG 42883, scores never written | PASS 2026-08-08 — LV-001 fixed on main via #4303 (01d2dfca7 EXTRACT-over-date-diff). Guards verify-customer-relationship-score + verify-no-extract-over-date-difference exit 0. LV-005 live-proved on deploy 2c10550: TRANSP score 56 Watch / USMCA 100 Thriving; master_data.customer_relationship_scores n_tup_ins 2709. Manifest was stale FAIL after fix — scoreboard truth PR. | #4303 |

Desktop audit: ~/Desktop/IH35-CURSOR-AUDIT/AUDITOR-RUN-2026-07-31/modules/customers-deep-2026-08-01.md
