# Module completion — Customers

**PROGRESS: 0 of 9** · complete: `false` · as_of: 2026-08-02 · live_sha: `—`

| Status | Count |
|---|---:|
| PASS | 0 |
| HOLD | 0 |
| OPEN | 9 |
| FAIL | 0 |
| UNVERIFIED | 0 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `CUST-S01` | **OPEN** | /customers roster density matches Neon active customers | scaffold — auditor PASS TRANSP: 1243 active exact match UI | — |
| `CUST-S02` | **OPEN** | Customer detail Transaction List ties to accounting.invoices | scaffold — auditor PASS sampled customer invoices match DOM | — |
| `CUST-S03` | **OPEN** | Nine follow-up tabs render honest COMING_STATE_COPY (not silent empty) | scaffold — auditor PASS: explicit stub messages for 9 tabs | — |
| `CUST-CHROME-01` | **OPEN** | Edit vs New transaction ActionButton visual parity on list header | scaffold — FAIL: 24×16px Edit vs 98×42px New transaction on same row | — |
| `CUST-CHROME-02` | **OPEN** | Edit button treatment consistent list vs CustomerDetail header | scaffold — FAIL: two unrelated Edit visual treatments | — |
| `CUST-CHROME-03` | **OPEN** | ParityTable column resize affordance discoverable | scaffold — resize works but 4-6px handle undiscoverable | — |
| `CUST-LINK-01` | **OPEN** | Customer → invoice → invoice_lines chain (system-wide SS-005) | scaffold — pre-existing: 11977 invoices / 1 invoice_line | — |
| `CUST-LINK-02` | **OPEN** | COI Requests tab honest when insurance.coi_request=0 | scaffold — auditor PASS: legitimately empty | — |
| `CUST-VERIFY-01` | **OPEN** | Customers module VERIFY-1..8 TRANSP + USMCA | scaffold — 12/12 tabs rendered TRANSP; USMCA UNVERIFIED this pass | — |

Desktop audit: ~/Desktop/IH35-CURSOR-AUDIT/AUDITOR-RUN-2026-07-31/modules/customers-deep-2026-08-01.md
