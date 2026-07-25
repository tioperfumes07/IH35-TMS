# Module completion — Banking (Module 4)

**PROGRESS: 4 of 13** · complete: `false` · as_of: 2026-07-25T03:41:00.000Z · live_sha: `a3f9c12`

| Status | Count |
|---|---:|
| PASS | 4 |
| HOLD | 0 |
| OPEN | 0 |
| FAIL | 6 |
| UNVERIFIED | 3 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `BANK-ECON-01` | **PASS** | Bank feed present (transactions > 0) | LIVE REFRESH 2026-07-25 03:41Z: bank_transactions=10628 (+6 vs prior read) | — |
| `BANK-ECON-02` | **FAIL** | matched_journal_entry_id density meaningful (not ≈0%) | LIVE REFRESH 2026-07-25 03:41Z: matched_je=3/10628; categorized_at_not_null=3 — unchanged since last read. Poster works when used (#3424 on main). Density is ops backlog — not a broken poster. | #3424 |
| `BANK-ECON-03` | **FAIL** | banking.transfers rows > 0 when operators record transfers OR honest empty with poster path proven | LIVE REFRESH 2026-07-25 03:41Z: transfers=0 — still true empty. Code+UI wired (createTransfer). PR #3445 [HOLD] fixes bank-feed mark-as-transfer to mint/link a real banking.transfers row via markBankFeedLineAsTransfer() — reuses existing createTransfer() poster, no new migration/flag. NOT yet merged. Remains FAIL until merged + operator uses it + Neon re-count > 0. | #3445 |
| `BANK-ECON-04` | **FAIL** | reconciliation_sessions > 0 with zero-diff closure (#3417) | LIVE REFRESH 2026-07-25 03:41Z: reconciliation_sessions=0 — unchanged. Workspace+start session wired (#3417 zero-diff); no session ever started. | #3417 |
| `BANK-ECON-05` | **PASS** | All live bank_accounts (deactivated_at IS NULL) bound to ledger_account_id (Cash GL) | Neon lucia 2026-07-25: of 16 bank_accounts, 9 deactivated (unbound OK); 7 live (deactivated_at IS NULL) all have ledger_account_id (7/7). Prior 8/16 FAIL counted deactivated duplicates. | — |
| `BANK-SURF-01` | **UNVERIFIED** | Banking Home + account detail — DoD A–E | Routes live; full picker/wizard matrix not re-run | — |
| `BANK-SURF-02` | **FAIL** | Categorize / Match — VERIFY-1..8 + JE when flag ON | Same as BANK-ECON-02: 10619 pending; when categorized (n=3) JE stamped 100%. Active UI calls /categorize-bulk with poster after #3424. | #3424 |
| `BANK-SURF-03` | **FAIL** | Transfers UI + poster path — live economics | LIVE REFRESH 2026-07-25 03:41Z: transfers=0; owner Option 1 for unpaired feed still open; see BANK-ECON-03 (PR #3445 HOLD not yet merged) | #3445 |
| `BANK-SURF-04` | **FAIL** | Reconciliation workspace — live session + zero-diff | sessions=0 | #3417 |
| `BANK-SURF-05` | **UNVERIFIED** | Factoring / Escrow / Relay / Plaid / Statement Import — active path + honest empty | Tabs reachable; economics not module-closed | — |
| `BANK-LINK-01` | **UNVERIFIED** | Bank txn ↔ Bill/Payment/Transfer EntityLink both-way with Neon FKs | Code paths exist; density proves almost no JE links | — |
| `BANK-CTRL-01` | **PASS** | BANK_FEED_GL_POSTING_ENABLED default OFF; no invented JE | Flags OFF by design; poster gated | — |
| `BANK-GATE-01` | **PASS** | Every banking money PR uses EVERY-PR checklist — process closed | #3430 merged on main (sha fc1cf13); verify-step 1430 enforces EVERY-PR checklist trailers on banking money commits | #3430 |

Desktop audit: ~/Desktop/IH35-CURSOR-AUDIT/modules/banking.md

## PACKET-6 structural guards (2026-07-25) — honesty

CI guards for Banking Home/detail, entry tabs, counterparty link shape, and cashbind keep-green shipped in #3459 (steps 1439–1442).
**These do NOT flip BANK-SURF-01/05 or BANK-LINK-01 to PASS** — Rule 23: structural mount < DoD A–E click-through + Neon density.
Scoreboard remains **4 of 13** until browser/Neon proof moves items.
