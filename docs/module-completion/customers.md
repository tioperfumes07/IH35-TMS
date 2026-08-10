# Module completion — Customers

**PROGRESS: 10 of 10** · complete: `true` · as_of: 2026-08-10T11:34:00.000Z · live_sha: `—`

| Status | Count |
|---|---:|
| PASS | 10 |
| HOLD | 0 |
| OPEN | 0 |
| FAIL | 0 |
| UNVERIFIED | 0 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `CUST-S01` | **PASS** | /customers roster density matches Neon active customers | PROD-VERIFIED 2026-08-10 Codex: Neon lucia READ ONLY, USMCA operating_company_id=5c854333-6ea5-4faa-af31-67cb272fef80, mdata.customers=9 and active deactivated_at IS NULL=9. Backend entity-scope/density guard verify-cust-s01-roster-density-filter exits 0. | — |
| `CUST-S02` | **PASS** | Customer detail Transaction List ties to accounting.invoices | PROD-VERIFIED 2026-08-10 Codex: Neon lucia READ ONLY USMCA accounting.invoices=31, all 31 customer-linked; accounting.invoice_lines=30 through those invoices. Customers transaction list wiring guard verify-cust-s02-transaction-list-invoices exits 0. | — |
| `CUST-S03` | **PASS** | Nine follow-up tabs render honest COMING_STATE_COPY (not silent empty) | PROD-VERIFIED 2026-08-10 Codex: USMCA roster has 9 live customer records; all nine follow-up tabs retain named honest COMING_STATE_COPY. Guard verify-cust-s03-coming-state-copy exits 0. | — |
| `CUST-CHROME-01` | **PASS** | Edit vs New transaction ActionButton visual parity on list header | PROD-VERIFIED 2026-08-10 Codex: USMCA customer surface contracts retain secondary Edit beside primary New transaction with stable test IDs. Guard verify-customers-chrome-action-parity exits 0. | — |
| `CUST-CHROME-02` | **PASS** | Edit button treatment consistent list vs CustomerDetail header | PROD-VERIFIED 2026-08-10 Codex: Customer details Edit and list-header Edit retain the same secondary Button treatment; header action parity guard exits 0 against the USMCA-ready surface. | — |
| `CUST-CHROME-03` | **PASS** | ParityTable column resize affordance discoverable | PROD-VERIFIED 2026-08-10 Codex: Customers roster uses the guarded ParityTable resize affordance (w-2, visible grip, tooltip and parity-table-col-resize test ID); customers parity guards exit 0. | — |
| `CUST-LINK-01` | **PASS** | Customer → invoice → invoice_lines chain (system-wide SS-005) | PROD-VERIFIED 2026-08-10 Codex: Neon lucia READ ONLY USMCA customer→invoice→invoice_lines chain has 31 invoices and 30 lines. EntityLink drill-through and honest zero-line state guard verify-cust-link-01-invoice-lines-honest exits 0. | — |
| `CUST-LINK-02` | **PASS** | COI Requests tab honest when insurance.coi_request=0 | PROD-VERIFIED 2026-08-10 Codex: Neon lucia READ ONLY USMCA insurance.coi_request=0. CoiTab names the true empty state and retains Create COI; guard verify-cust-link-02-coi-honest-empty exits 0. | — |
| `CUST-VERIFY-01` | **PASS** | Customers module VERIFY-1..8 TRANSP + USMCA | PROD-VERIFIED 2026-08-10 Codex: Neon lucia READ ONLY USMCA customers=9 active=9, customer-linked invoices=31/31, invoice_lines=30, COI requests=0. Meta guard verify-cust-verify-01 composes routes, entity scope, honest empties, chrome, forward/reverse invoice linkage and locks all nine residual rows prod_verified=true; selftest exits 0. | — |
| `LV-001` | **PASS** | Relationship Health 500s on every customer — PG 42883, scores never written | PASS 2026-08-08 — LV-001 fixed on main via #4303 (01d2dfca7 EXTRACT-over-date-diff). Guards verify-customer-relationship-score + verify-no-extract-over-date-difference exit 0. LV-005 live-proved on deploy 2c10550: TRANSP score 56 Watch / USMCA 100 Thriving; master_data.customer_relationship_scores n_tup_ins 2709. Manifest was stale FAIL after fix — scoreboard truth PR. | #4303 |

Desktop audit: ~/Desktop/IH35-CURSOR-AUDIT/AUDITOR-RUN-2026-07-31/modules/customers-deep-2026-08-01.md
