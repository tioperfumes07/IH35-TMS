# Module completion — Banking (Module 4)

**PROGRESS: 7 of 13** · complete: `false` · as_of: 2026-07-25T04:33:18.638Z · live_sha: `fc1cf13`

| Status | Count |
|---|---:|
| PASS | 7 |
| HOLD | 0 |
| OPEN | 0 |
| FAIL | 6 |
| UNVERIFIED | 0 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `BANK-ECON-01` | **PASS** | Bank feed present (transactions > 0) | Neon lucia 2026-07-25: bank_transactions=10622 | — |
| `BANK-ECON-02` | **FAIL** | matched_journal_entry_id density meaningful (not ≈0%) | Neon lucia 2026-07-25: matched_je=3/10622; categorized=3; pending_categorization=10619; categorized∧JE NULL=0. Poster works when used (#3424 on main). Density is ops backlog — not a broken poster. | #3424 |
| `BANK-ECON-03` | **FAIL** | banking.transfers rows > 0 when operators record transfers OR honest empty with poster path proven | Neon lucia 2026-07-25: transfers=0. Code+UI wired (createTransfer); never used by operators. Feed mark-transfer does not insert banking.transfers. | — |
| `BANK-ECON-04` | **FAIL** | reconciliation_sessions > 0 with zero-diff closure (#3417) | Neon lucia 2026-07-25: reconciliation_sessions=0. Workspace+start session wired (#3417 zero-diff); no session ever started. | #3417 |
| `BANK-ECON-05` | **PASS** | All live bank_accounts (deactivated_at IS NULL) bound to ledger_account_id (Cash GL) | Neon lucia 2026-07-25: of 16 bank_accounts, 9 deactivated (unbound OK); 7 live (deactivated_at IS NULL) all have ledger_account_id (7/7). Prior 8/16 FAIL counted deactivated duplicates. | — |
| `BANK-SURF-01` | **PASS** | Banking Home + account detail — DoD A–E | BANK-F04 structural: routes /banking + /banking/accounts/:id mounted; BankAccountDetail→DesignView; API /api/v1/banking; guard verify-bank-surf-home-detail (+step 1440). Browser picker matrix residual → BANK-F08/F09. | — |
| `BANK-SURF-02` | **FAIL** | Categorize / Match — VERIFY-1..8 + JE when flag ON | Same as BANK-ECON-02: 10619 pending; when categorized (n=3) JE stamped 100%. Active UI calls /categorize-bulk with poster after #3424. | #3424 |
| `BANK-SURF-03` | **FAIL** | Transfers UI + poster path — live economics | transfers=0; owner Option 1 for unpaired feed | — |
| `BANK-SURF-04` | **FAIL** | Reconciliation workspace — live session + zero-diff | sessions=0 | #3417 |
| `BANK-SURF-05` | **PASS** | Factoring / Escrow / Relay / Plaid / Statement Import — active path + honest empty | BANK-F06 structural: Factoring/Escrow/Relay/Plaid/Statement Import routes+tabs+sidebar mounted (never-delete). Guard verify-bank-surf-entry-tabs (+step 1440). Neon economics for money leaves remain under BANK-F01–F03. | #3459 |
| `BANK-LINK-01` | **PASS** | Bank txn ↔ Bill/Payment/Transfer EntityLink both-way with Neon FKs | BANK-F07 structural: categorization.routes persists categorization_vendor_id/customer_id + JOIN mdata.vendors/customers; EntityLink payment/bill_payment/transfer/bank_transaction both-way; banking.* writes only (no RETIRE bank.* in banking/). Guard verify-bank-surfaces-and-counterparty (+step 1441). Neon lucia counterparty_fk=2 (sparse density residual under BANK-F01). | #3459 |
| `BANK-CTRL-01` | **PASS** | BANK_FEED_GL_POSTING_ENABLED default OFF; no invented JE | Flags OFF by design; poster gated | — |
| `BANK-GATE-01` | **PASS** | Every banking money PR uses EVERY-PR checklist — process closed | #3430 merged on main (sha fc1cf13); verify-step 1430 enforces EVERY-PR checklist trailers on banking money commits | #3430 |

Desktop audit: ~/Desktop/IH35-CURSOR-AUDIT/modules/banking.md
