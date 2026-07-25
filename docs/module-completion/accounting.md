# Module completion — Accounting (Module 3)

**PROGRESS: 8 of 25** · complete: `false` · as_of: 2026-07-25T03:41:00.000Z · live_sha: `a3f9c12`

| Status | Count |
|---|---:|
| PASS | 8 |
| HOLD | 0 |
| OPEN | 0 |
| FAIL | 12 |
| UNVERIFIED | 5 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `ACCT-ECON-01` | **PASS** | bill_lines dense vs bills (header+lines) | Neon lucia: bills=16212 bill_lines=155049 (2026-07-24) | #3382 |
| `ACCT-ECON-02` | **PASS** | bill_payments live density > 0 after QBO pull+project | Neon lucia 2026-07-25: bill_payments=6479 (all qbo-sourced); qbo_ap_bill_payments=6313; QBO_AP_BILL_PAYMENTS_PROJECTION_ENABLED=true TRANSP; sync_runs ap_bill_payments_inbound_mirror success×2 last 23:23Z | #3398 |
| `ACCT-ECON-03` | **FAIL** | AR payments live density > 0 after QBO pull+project | Neon lucia 2026-07-25: payments=0 payment_applications=0; qbo_ar_payments=23830; pull ON + sync_runs ar_payments_inbound_mirror success 23:12Z; QBO_AR_PAYMENTS_PROJECTION_ENABLED=false TRANSP pending #3433 deploy (idle_in_transaction FATAL) | #3433 |
| `ACCT-ECON-04` | **FAIL** | expenses live density > 0 after Purchase pull+project | Neon lucia 2026-07-25: expenses=0 expense_lines=0; qbo_purchases=27984; pull ON + sync_runs qbo_purchases_inbound_mirror success×2 last 23:25Z; QBO_EXPENSES_PROJECTION_ENABLED=false TRANSP pending #3433 | #3433 |
| `ACCT-ECON-05` | **FAIL** | vendor_credits live path exercised or honest empty | Neon lucia 2026-07-25: vendor_credits=0 — path exists (#3426) but no live rows | #3426 |
| `ACCT-PULL-01` | **PASS** | QBO AR Payment mirror pull writes rows + qbo.sync_runs | Neon lucia 2026-07-25: qbo_ar_payments=23830; qbo.sync_runs kind=ar_payments_inbound_mirror status=success n=1 completed 2026-07-24T23:12:22Z | #3411 |
| `ACCT-PULL-02` | **PASS** | QBO BillPayment mirror pull writes rows | Neon lucia 2026-07-25: qbo_ap_bill_payments=6313; sync_runs ap_bill_payments_inbound_mirror success×2 last 2026-07-24T23:23:41Z | #3398 |
| `ACCT-PULL-03` | **PASS** | QBO Purchase mirror pull writes rows | Neon lucia 2026-07-25: qbo_purchases=27984; sync_runs qbo_purchases_inbound_mirror success×2 last 2026-07-24T23:25:26Z | #3399 |
| `ACCT-LINK-01` | **FAIL** | journal_entry_types inbound FK from journal_entries (not island) | LIVE REFRESH 2026-07-25: still 16 rows / 0 inbound FKs; journal_entries has NO journal_entry_type_id column on prod. PR #3440 [HOLD] adds additive nullable FK col — migration 202607960000 NOT yet Neon-applied. Remains FAIL until owner Neon-apply + inbound density re-measure. | #3440 |
| `ACCT-LINK-02` | **FAIL** | detail_types canonical FK from catalogs.accounts (not text subtype only) | 144 rows 0 inbound FKs; accounts.account_subtype text | — |
| `ACCT-LINK-03` | **FAIL** | Bill unit_id / insurance_claim_id / linked_work_order_uuid density > 0 where applicable | vendor_id=16212; unit/claim/wo = 0 | #3425 |
| `ACCT-LINK-04` | **FAIL** | expense_categories inbound FK from expense lines | HOLD PR #3446: additive same-entity FK expense_lines→catalogs.expense_categories (mig 202608020000). FAIL until Neon-apply proves FK + inbound density (lucia). | #3446 |
| `ACCT-LINK-05` | **FAIL** | posting_templates inbound FK from consumers (WF-053) | LIVE REFRESH 2026-07-25: still 0 inbound FKs; posting_batches has NO posting_template_id column on prod; catalogs.posting_templates still 0 rows (lucia-verified true empty, not RLS-masked). PR #3444 [HOLD] adds posting_batches -> posting_templates consumer stamp — NOT yet Neon-applied. Remains FAIL until owner Neon-apply. | #3444 |
| `ACCT-SURF-01` | **UNVERIFIED** | Bills family — DoD A–E + VERIFY 1–8 on live surfaces | Lines dense; bill_payments=6479 live; wizard depth not re-audited field-by-field 2026-07-25 | — |
| `ACCT-SURF-02` | **FAIL** | Expenses — DoD A–E + VERIFY 1–8 with live rows | expenses=0 — cannot prove reverse/economics live until #3433 deploy + projection ON | #3433 |
| `ACCT-SURF-03` | **UNVERIFIED** | Bill payment — DoD A–E + VERIFY 1–8 with live rows | bill_payments=6479 density PASS; DoD A–E + VERIFY 1–8 surface click-through not re-run 2026-07-25 | — |
| `ACCT-SURF-04` | **FAIL** | Receive Payment — DoD A–E + VERIFY 1–8 with live rows | payments=0 — blocked on AR projection OFF (#3433) | #3433 |
| `ACCT-SURF-05` | **FAIL** | Journal Entries — type catalog wired + reverse drill | JE type island; 8 JEs sparse | — |
| `ACCT-SURF-06` | **FAIL** | Chart of Accounts / Detail Types — canonical detail_type link | text subtype only | — |
| `ACCT-SURF-07` | **UNVERIFIED** | Account Register + All Transactions reverse to money docs | UI exists; live density for payments/expenses not proven | — |
| `ACCT-SURF-08` | **UNVERIFIED** | Period close / Audit trail / Posting lineage — active path + evidence | Routes mounted; full click-through not re-run this audit | — |
| `ACCT-SURF-09` | **UNVERIFIED** | Factoring / Escrow / Settlements cross-links from Accounting More ▾ | Nav leaves exist; economics density not module-closed | — |
| `ACCT-CTRL-01` | **PASS** | Parallel books — refuse invented TMS JE for qbo-sourced money | Refuse-GL paths merged; flags default OFF | #3386 |
| `ACCT-CTRL-02` | **PASS** | CoA roles resolvable under lucia + company GUC (not false-empty) | chart_of_accounts_roles=89 with lucia | #3400 |
| `ACCT-GATE-01` | **PASS** | Every money PR uses EVERY-PR checklist (VERIFY-1..8) — process closed | #3430 merged on main (sha fc1cf13); verify-steps 1430+1431 + Rule 24 live; money PRs require MODULE_PROGRESS trailers | #3430 |

Desktop audit: ~/Desktop/IH35-CURSOR-AUDIT/modules/accounting.md
