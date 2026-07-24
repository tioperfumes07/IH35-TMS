# Module completion — Accounting (Module 3)

**PROGRESS: 3 of 25** · complete: `false` · as_of: 2026-07-24T23:30:00Z · live_sha: `2088757`

| Status | Count |
|---|---:|
| PASS | 3 |
| HOLD | 0 |
| OPEN | 1 |
| FAIL | 17 |
| UNVERIFIED | 4 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `ACCT-ECON-01` | **PASS** | bill_lines dense vs bills (header+lines) | Neon lucia: bills=16212 bill_lines=155049 (2026-07-24) | #3382 |
| `ACCT-ECON-02` | **FAIL** | bill_payments live density > 0 after QBO pull+project | Neon lucia: bill_payments=0; qbo_ap_bill_payments=0; projection flag OFF | #3398 |
| `ACCT-ECON-03` | **FAIL** | AR payments live density > 0 after QBO pull+project | Neon lucia: payments=0; qbo_ar_payments=0; pull flag ON but qbo.sync_runs empty | #3411 |
| `ACCT-ECON-04` | **FAIL** | expenses live density > 0 after Purchase pull+project | Neon lucia: expenses=0; qbo_purchases=0 | #3399 |
| `ACCT-ECON-05` | **FAIL** | vendor_credits live path exercised or honest empty | Neon lucia: vendor_credits=0 | #3426 |
| `ACCT-PULL-01` | **FAIL** | QBO AR Payment mirror pull writes rows + qbo.sync_runs | qbo.sync_runs=0 rows; mirrors exist empty despite pull flag ON | — |
| `ACCT-PULL-02` | **FAIL** | QBO BillPayment mirror pull writes rows | mdata.qbo_ap_bill_payments=0 | #3398 |
| `ACCT-PULL-03` | **FAIL** | QBO Purchase mirror pull writes rows | mdata.qbo_purchases=0 | #3399 |
| `ACCT-LINK-01` | **FAIL** | journal_entry_types inbound FK from journal_entries (not island) | 16 rows, 0 inbound FKs; JE has no type column | — |
| `ACCT-LINK-02` | **FAIL** | detail_types canonical FK from catalogs.accounts (not text subtype only) | 144 rows 0 inbound FKs; accounts.account_subtype text | — |
| `ACCT-LINK-03` | **FAIL** | Bill unit_id / insurance_claim_id / linked_work_order_uuid density > 0 where applicable | vendor_id=16212; unit/claim/wo = 0 | #3425 |
| `ACCT-LINK-04` | **FAIL** | expense_categories inbound FK from expense lines | 0 inbound FKs | — |
| `ACCT-LINK-05` | **FAIL** | posting_templates inbound FK from consumers (WF-053) | 0 inbound FKs | — |
| `ACCT-SURF-01` | **UNVERIFIED** | Bills family — DoD A–E + VERIFY 1–8 on live surfaces | Lines dense; payment density 0; wizard depth not re-audited field-by-field 2026-07-24 | — |
| `ACCT-SURF-02` | **FAIL** | Expenses — DoD A–E + VERIFY 1–8 with live rows | expenses=0 — cannot prove reverse/economics live | — |
| `ACCT-SURF-03` | **FAIL** | Bill payment — DoD A–E + VERIFY 1–8 with live rows | bill_payments=0 | — |
| `ACCT-SURF-04` | **FAIL** | Receive Payment — DoD A–E + VERIFY 1–8 with live rows | payments=0 | — |
| `ACCT-SURF-05` | **FAIL** | Journal Entries — type catalog wired + reverse drill | JE type island; 8 JEs sparse | — |
| `ACCT-SURF-06` | **FAIL** | Chart of Accounts / Detail Types — canonical detail_type link | text subtype only | — |
| `ACCT-SURF-07` | **UNVERIFIED** | Account Register + All Transactions reverse to money docs | UI exists; live density for payments/expenses not proven | — |
| `ACCT-SURF-08` | **UNVERIFIED** | Period close / Audit trail / Posting lineage — active path + evidence | Routes mounted; full click-through not re-run this audit | — |
| `ACCT-SURF-09` | **UNVERIFIED** | Factoring / Escrow / Settlements cross-links from Accounting More ▾ | Nav leaves exist; economics density not module-closed | — |
| `ACCT-CTRL-01` | **PASS** | Parallel books — refuse invented TMS JE for qbo-sourced money | Refuse-GL paths merged; flags default OFF | #3386 |
| `ACCT-CTRL-02` | **PASS** | CoA roles resolvable under lucia + company GUC (not false-empty) | chart_of_accounts_roles=89 with lucia | #3400 |
| `ACCT-GATE-01` | **OPEN** | Every money PR uses EVERY-PR checklist (VERIFY-1..8) — process closed | Gate on #3430 — not yet on main as of audit | #3430 |

Desktop audit: ~/Desktop/IH35-CURSOR-AUDIT/modules/accounting.md
