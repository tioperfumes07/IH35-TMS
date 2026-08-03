# Module completion — Customers

**PROGRESS: 7 of 9** · complete: `false` · as_of: 2026-08-02 · live_sha: `—`

| Status | Count |
|---|---:|
| PASS | 7 |
| HOLD | 0 |
| OPEN | 2 |
| FAIL | 0 |
| UNVERIFIED | 0 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `CUST-S01` | **PASS** | /customers roster density matches Neon active customers | 2026-08-03 Cursor Neon lucia (br-fancy-credit-akjnd07a): active deactivated_at IS NULL → TRANSP 1243 · TRK 1446 · USMCA 1 (matches auditor TRANSP 1243). Backend customers.routes status=active filters deactivated_at IS NULL. Guard verify-cust-s01-roster-density-filter + step 2232. | — |
| `CUST-S02` | **PASS** | Customer detail Transaction List ties to accounting.invoices | 2026-08-03 Cursor: Customers.tsx transaction_list calls listInvoices(companyId). Neon lucia accounting.invoices count=11981 all with customer_id. Guard verify-cust-s02-transaction-list-invoices + step 2234. (invoice_lines density remains CUST-LINK-01 — 5 lines only.) | — |
| `CUST-S03` | **PASS** | Nine follow-up tabs render honest COMING_STATE_COPY (not silent empty) | 2026-08-03 Cursor: COMING_STATE_COPY has 9 keys (activity_feed…conversations) each naming missing endpoint/source + follow-up; CustomerTabComingState renders copy. Guard verify-cust-s03-coming-state-copy + step 2228. Auditor scaffold already PASS; ratchet locks it. | — |
| `CUST-CHROME-01` | **PASS** | Edit vs New transaction ActionButton visual parity on list header | 2026-08-03 Cursor: Customers master-detail header Edit is Button variant=secondary className=h-8 beside primary New transaction (was ActionButton text-link). Vendors sibling same. Guard verify-cust-chrome-header-action-parity + step 2224. data-testid customer-header-edit / customer-header-new-transaction. | — |
| `CUST-CHROME-02` | **PASS** | Edit button treatment consistent list vs CustomerDetail header | 2026-08-03 Cursor: Customer details tab Edit (data-testid=customer-details-edit) uses the same Button variant=secondary chrome as list-header Edit — no ActionButton dual path. CustomerDetail page Edit remains primary Button for inline edit-mode (different action). | — |
| `CUST-CHROME-03` | **PASS** | ParityTable column resize affordance discoverable | 2026-08-03 Cursor: ParityTable col-resize is w-2 opaque slate-200/90 + grip + title tooltip + data-testid=parity-table-col-resize (was ~w-1.5 gray-300/80 hard to see). Guard verify-parity-table-resize-affordance + step 2226. | — |
| `CUST-LINK-01` | **OPEN** | Customer → invoice → invoice_lines chain (system-wide SS-005) | 2026-08-03 Neon lucia: accounting.invoices=11981 with customer_id; accounting.invoice_lines=5 only — chain incomplete for line drill-through. Money/backfill lane. Holds OPEN until lines density or honest line-empty UX + guard. | — |
| `CUST-LINK-02` | **PASS** | COI Requests tab honest when insurance.coi_request=0 | 2026-08-03 Cursor: Neon prod br-fancy-credit-akjnd07a SET app.bypass_rls=lucia → insurance.coi_request count=0 AND n_live_tup=0 (true empty). CoiTab emptyText="No COI requests yet…" + Create COI retained. Guard verify-cust-link-02-coi-honest-empty + step 2230. | — |
| `CUST-VERIFY-01` | **OPEN** | Customers module VERIFY-1..8 TRANSP + USMCA | scaffold — 12/12 tabs rendered TRANSP; USMCA UNVERIFIED this pass | — |

Desktop audit: ~/Desktop/IH35-CURSOR-AUDIT/AUDITOR-RUN-2026-07-31/modules/customers-deep-2026-08-01.md
