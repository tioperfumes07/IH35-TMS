# Module completion — Banking (Module 4)

**PROGRESS: 3 of 13** · complete: `false` · as_of: 2026-07-25T00:06:12.016Z · live_sha: `fc1cf13`

| Status | Count |
|---|---:|
| PASS | 3 |
| HOLD | 0 |
| OPEN | 0 |
| FAIL | 7 |
| UNVERIFIED | 3 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `BANK-ECON-01` | **PASS** | Bank feed present (transactions > 0) | Neon lucia 2026-07-25: bank_transactions=10622 | — |
| `BANK-ECON-02` | **FAIL** | matched_journal_entry_id density meaningful (not ≈0%) | Neon lucia 2026-07-25: matched_journal_entry_id=3 / 10622 (~0.03%) | #3424 |
| `BANK-ECON-03` | **FAIL** | banking.transfers rows > 0 when operators record transfers OR honest empty with poster path proven | transfers=0 | — |
| `BANK-ECON-04` | **FAIL** | reconciliation_sessions > 0 with zero-diff closure (#3417) | reconciliation_sessions=0 | #3417 |
| `BANK-ECON-05` | **FAIL** | All bank_accounts bound to ledger_account_id (Cash GL) | Neon lucia 2026-07-25: 8/16 bank_accounts have ledger_account_id | — |
| `BANK-SURF-01` | **UNVERIFIED** | Banking Home + account detail — DoD A–E | Routes live; full picker/wizard matrix not re-run | — |
| `BANK-SURF-02` | **FAIL** | Categorize / Match — VERIFY-1..8 + JE when flag ON | JE density 3/10k; bulk categorize HOLD #3424 | #3424 |
| `BANK-SURF-03` | **FAIL** | Transfers UI + poster path — live economics | transfers=0; owner Option 1 for unpaired feed | — |
| `BANK-SURF-04` | **FAIL** | Reconciliation workspace — live session + zero-diff | sessions=0 | #3417 |
| `BANK-SURF-05` | **UNVERIFIED** | Factoring / Escrow / Relay / Plaid / Statement Import — active path + honest empty | Tabs reachable; economics not module-closed | — |
| `BANK-LINK-01` | **UNVERIFIED** | Bank txn ↔ Bill/Payment/Transfer EntityLink both-way with Neon FKs | Code paths exist; density proves almost no JE links | — |
| `BANK-CTRL-01` | **PASS** | BANK_FEED_GL_POSTING_ENABLED default OFF; no invented JE | Flags OFF by design; poster gated | — |
| `BANK-GATE-01` | **PASS** | Every banking money PR uses EVERY-PR checklist — process closed | #3430 merged on main (sha fc1cf13); verify-step 1430 enforces EVERY-PR checklist trailers on banking money commits | #3430 |

Desktop audit: ~/Desktop/IH35-CURSOR-AUDIT/modules/banking.md
