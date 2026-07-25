# Module completion — Banking (Module 4)

**PROGRESS: 4 of 16** · complete: `false` · as_of: 2026-07-25T16:50:00.000Z · live_sha: `b4c3158`

| Status | Count |
|---|---:|
| PASS | 4 |
| HOLD | 0 |
| OPEN | 0 |
| FAIL | 7 |
| UNVERIFIED | 5 |

## RANKED BANKING FAIL LIST (published M — every future banking PR cites a row here)

_PERMANENT-FIX §1 (BANK-00) — no Banking PR may land without citing a row here; M binds to items[] above and never freezes below live leaves (Rule 21/24)._

| Rank | ID | P | Title | Canonical target | Bound item(s) (live status) | Fix block |
|---|---|---|---|---|---|---|
| 1 | `BANK-F01` | P0 | bank feed → JE density ~3/10628; no bulk categorize→GL poster density | banking.bank_transactions→accounting.journal_entries | `BANK-ECON-02`:FAIL · `BANK-SURF-02`:FAIL | BANK-ECON-02 |
| 2 | `BANK-F02` | P0 | banking.transfers = 0; no linked transfer write from a bank line | banking.transfers | `BANK-ECON-03`:FAIL · `BANK-SURF-03`:FAIL | BANK-ECON-03/BANK-SURF-03 |
| 3 | `BANK-F03` | P0 | banking.reconciliation_sessions = 0; no reconcile flow; RLS root cause | banking.reconciliation_sessions | `BANK-ECON-04`:FAIL · `BANK-SURF-04`:UNVERIFIED | BANK-ECON-04/BANK-SURF-04 |
| 4 | `BANK-F04` | P1 | counterparty stored as memo, not a vendor/customer FK | mdata.vendors / mdata.customers | `BANK-LINK-01`:UNVERIFIED | BANK-SURF-01/02/05+BANK-LINK-01 |
| 5 | `BANK-F05` | P1 | surfaces (feed/register/account-detail/rules) entity-scope not both-way drilled | banking.* | `BANK-SURF-01`:UNVERIFIED · `BANK-SURF-02`:FAIL · `BANK-SURF-05`:UNVERIFIED | BANK-SURF-01/02/05 |
| 6 | `BANK-F06` | P2 | money-gate honesty: flags OFF + MODULE_PROGRESS = manifest | docs/module-completion/banking.json | `BANK-CTRL-01`:PASS · `BANK-GATE-01`:PASS | BANK-CTRL-01+BANK-GATE-01 |
| 7 | `BANK-F07` | P0 | no per-surface DoD A–E + VERIFY 1–8 sweep across Banking leaves | docs/module-completion/banking.json (binding) | `BANK-SURF-01`:UNVERIFIED · `BANK-SURF-02`:FAIL · `BANK-SURF-04`:UNVERIFIED · `BANK-SURF-05`:UNVERIFIED · `BANK-LINK-01`:UNVERIFIED | BANK-MODULE-DOD (maps to the SURF/LINK leaves above — no separate manifest item invented) |
| — | `BANK-P01` | PASS | bank_accounts 7/7 active cash-bound (legitimate PASS, keep-guard) | banking.bank_accounts | `BANK-ECON-05`:PASS | BANK-ECON-05+BANK-GATE-01 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `BANK-ECON-01` | **PASS** | Bank feed present (transactions > 0) | LIVE REFRESH 2026-07-25 03:41Z: bank_transactions=10628 (+6 vs prior read) | — |
| `BANK-ECON-02` | **FAIL** | matched_journal_entry_id density meaningful (not ≈0%) | LIVE REFRESH 2026-07-25 16:50Z: matched_je=3/10628; categorized_at_not_null=3 — unchanged. Poster path wired (#3424 merged on main): bulk categorize→maybePostBankCategorizationToGl sets matched_journal_entry_id when flag ON. Density is ops backlog — not a broken poster. GUARD: verify-step 1480 (verify-bank-econ-02-poster-path-wired). FAIL until operator categorizes at scale + Neon re-count. | #3424 |
| `BANK-ECON-03` | **FAIL** | banking.transfers rows > 0 when operators record transfers OR honest empty with poster path proven | LIVE REFRESH 2026-07-25 16:50Z: transfers=0 — still true empty on prod. markBankFeedLineAsTransfer() mint path wired (#3445 merged on main): bank-feed mark-as-transfer mints/links real banking.transfers row via insertTransferInClient, flag-gated OFF. GUARD: verify-step 1481 (verify-bank-econ-03-transfer-path-wired). FAIL until operator records a transfer + Neon re-count > 0. | #3445 |
| `BANK-ECON-04` | **FAIL** | reconciliation_sessions > 0 with zero-diff closure (#3417) | REWRITE 2026-07-25: db/migrations/202608030000_bank_accounts_rls_bypass_lucia.sql is APPLIED on Neon — not a Neon-apply HOLD. Schema unblocked. Neon lucia reconciliation_sessions still 0 = ops-density / browser (or residual app bug chase with fresh evidence). Do not re-hold for owner Neon-apply of 202608030000. Flags stay OFF. OWNER decides cutover. See docs/trackers/acct-bank-remaining-blocks-2026-07-25/BANK-ECON-04-recon-sessions-ops-density.md | schema-live — ops/browser remaining |
| `BANK-ECON-05` | **PASS** | All live bank_accounts (deactivated_at IS NULL) bound to ledger_account_id (Cash GL) | Neon lucia 2026-07-25: of 16 bank_accounts, 9 deactivated (unbound OK); 7 live (deactivated_at IS NULL) all have ledger_account_id (7/7). Prior 8/16 FAIL counted deactivated duplicates. Keep-guard: scripts/verify-bank-account-cashbind.mjs + verify-step 1442 (active-only; never deletes deactivated). | — |
| `BANK-SURF-01` | **UNVERIFIED** | Banking Home + account detail — DoD A–E | Deep structural DoD guarded (verify-bank-surf-01-dod / step 1465): /banking + /banking/accounts/:id + AccountTilesRow Factoring/Escrow never-delete + BankingTransactionsDesignView on detail + canonical /api/v1/banking/*. Prior step 1439 route pin retained. DoD A–E + VERIFY 1–8 browser click-through TRANSP+USMCA still required — structural ≠ SURF PASS (Rule 23). | OPEN — Cotulla-08 BANK-08 SURF-01 |
| `BANK-SURF-02` | **FAIL** | Categorize / Match — VERIFY-1..8 + JE when flag ON | Same as BANK-ECON-02: 10625 pending; when categorized (n=3) JE stamped 100%. Active UI calls /categorize-bulk with poster (#3424 merged). verify-step 1480 pins wiring; density FAIL is ops backlog. | #3424 |
| `BANK-SURF-03` | **FAIL** | Transfers UI + poster path — live economics | LIVE REFRESH 2026-07-25 16:50Z: transfers=0; mark-as-transfer + Transfers surface wired (#3445 merged). Empty-state honesty banner refuses fake all-clear. verify-step 1481 pins wiring; FAIL until operator use → count>0. See BANK-ECON-03. | #3445 |
| `BANK-SURF-04` | **UNVERIFIED** | Reconciliation workspace — live session + zero-diff | REWRITE 2026-07-25: companion to BANK-ECON-04 — 202608030000 APPLIED. Workspace wiring treated live; SURF PASS blocked only by ops/browser proof (Rule 23), not Neon-apply. See BANK-SURF-04-recon-workspace-ops-browser.md in acct-bank-remaining-blocks packet. | schema-live — ops/browser remaining |
| `BANK-SURF-05` | **UNVERIFIED** | Factoring / Escrow / Relay / Plaid / Statement Import — active path + honest empty | Deep structural DoD guarded (verify-bank-surf-05-dod / step 1466): Factoring/Escrow/Relay/Plaid/Statement Import routes mount BankingHomePage initialTab + tab bodies (DriverEscrowTabContent, StatementUpload, BankingPlaidConnectionsPanel) — no ComingSoon twin; sidebar flyout never-delete. Prior step 1440 route pin retained. Browser DoD click-through still UNVERIFIED — not flipped to PASS (Rule 23). | OPEN — Cotulla-08 BANK-08 SURF-05 |
| `BANK-LINK-01` | **UNVERIFIED** | Bank txn ↔ Bill/Payment/Transfer EntityLink both-way with Neon FKs | REWRITE 2026-07-25: db/migrations/202608050000_bank_link_01_counterparty_same_entity_fk.sql APPLIED on Neon (bank_tx_categorization_vendor_same_entity_fkey present under lucia check 2026-07-25). Not HELD for Neon-apply. Remaining: ops counterparty density + browser both-way categorize drill TRANSP+USMCA. Guards 1441/1482. See BANK-LINK-01-counterparty-fk-ops-browser.md. | schema-live — ops/browser remaining |
| `BANK-CTRL-01` | **PASS** | BANK_FEED_GL_POSTING_ENABLED default OFF; no invented JE | Flags OFF by design; poster gated | — |
| `BANK-GATE-01` | **PASS** | Every banking money PR uses EVERY-PR checklist — process closed | #3430 merged on main (sha fc1cf13); verify-step 1430 enforces EVERY-PR checklist trailers on banking money commits. BANK-ECON-05 cash-bind keep-guard (verify-step 1442) confirms MODULE_PROGRESS honesty (pass_count=4, complete=false). | #3430 |
| `BANK-F08` | **FAIL** | Categorization Rules + automatch deep-wizard DoD | NEW LEAF 2026-07-25 (Rule 21 M-grows): /banking/categorization-rules mounted but no deep-wizard DoD/VERIFY leaf. Dispatch: docs/trackers/acct-bank-remaining-blocks-2026-07-25/BANK-F08-categorization-rules-automatch-depth.md | — |
| `BANK-F09` | **FAIL** | Banking settings / reports / email-queue deep-wizard DoD | NEW LEAF 2026-07-25 (Rule 21 M-grows): settings/reports/email-queue surfaces need deep-wizard VERIFY. Dispatch: docs/trackers/acct-bank-remaining-blocks-2026-07-25/BANK-F09-settings-reports-email-queue-deep-wizard.md | — |

Desktop audit: ~/Desktop/IH35-CURSOR-AUDIT/modules/banking.md
