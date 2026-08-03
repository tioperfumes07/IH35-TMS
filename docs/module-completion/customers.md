# Module completion — Customers

**PROGRESS: 3 of 9** · complete: `false` · as_of: 2026-08-02 · live_sha: `—`

| Status | Count |
|---|---:|
| PASS | 3 |
| HOLD | 0 |
| OPEN | 6 |
| FAIL | 0 |
| UNVERIFIED | 0 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `CUST-S01` | **OPEN** | /customers roster density matches Neon active customers | scaffold — auditor PASS TRANSP: 1243 active exact match UI | — |
| `CUST-S02` | **OPEN** | Customer detail Transaction List ties to accounting.invoices | scaffold — auditor PASS sampled customer invoices match DOM | — |
| `CUST-S03` | **OPEN** | Nine follow-up tabs render honest COMING_STATE_COPY (not silent empty) | scaffold — auditor PASS: explicit stub messages for 9 tabs | — |
| `CUST-CHROME-01` | **PASS** | Edit vs New transaction ActionButton visual parity on list header | 2026-08-03 Cursor: Customers master-detail header Edit is Button variant=secondary className=h-8 beside primary New transaction (was ActionButton text-link). Vendors sibling same. Guard verify-cust-chrome-header-action-parity + step 2224. data-testid customer-header-edit / customer-header-new-transaction. | — |
| `CUST-CHROME-02` | **PASS** | Edit button treatment consistent list vs CustomerDetail header | 2026-08-03 Cursor: Customer details tab Edit (data-testid=customer-details-edit) uses the same Button variant=secondary chrome as list-header Edit — no ActionButton dual path. CustomerDetail page Edit remains primary Button for inline edit-mode (different action). | — |
| `CUST-CHROME-03` | **PASS** | ParityTable column resize affordance discoverable | 2026-08-03 Cursor: ParityTable col-resize is w-2 opaque slate-200/90 + grip + title tooltip + data-testid=parity-table-col-resize (was ~w-1.5 gray-300/80 hard to see). Guard verify-parity-table-resize-affordance + step 2226. | — |
| `CUST-LINK-01` | **OPEN** | Customer → invoice → invoice_lines chain (system-wide SS-005) | scaffold — pre-existing: 11977 invoices / 1 invoice_line | — |
| `CUST-LINK-02` | **OPEN** | COI Requests tab honest when insurance.coi_request=0 | scaffold — auditor PASS: legitimately empty | — |
| `CUST-VERIFY-01` | **OPEN** | Customers module VERIFY-1..8 TRANSP + USMCA | scaffold — 12/12 tabs rendered TRANSP; USMCA UNVERIFIED this pass | — |

Desktop audit: ~/Desktop/IH35-CURSOR-AUDIT/AUDITOR-RUN-2026-07-31/modules/customers-deep-2026-08-01.md
