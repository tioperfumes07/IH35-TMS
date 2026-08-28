# QUERY-BACK + LIVE HEALTHZ + NO FALSE COMPLETE (owner 2026-08-28 · PERMANENT)

A seat's loop is **not complete** until it queries back **every row it created** and reports what the **ledger** says (JE, `is_sample_data`, reverse links, factor_id) — not what the UI said.

Lead **re-reads** `GET /api/v1/healthz/shallow` `version` every lead turn. INBOX NOW SHA = that version (or named in-flight deploy). Stale SHA in a report is a lead defect.

**Idle:** steal after `docs/bus/STEAL-CLAIMS.json`. Do not stamp green to look busy.

**Seed:** exercise a code path (~25 gate/C31 tables). Never seed POD to make Event 2 fire. Never seed to satisfy a scoreboard cell.

**C25–C31:** every `URGENT_16` module `*.required.json` must declare the seven economic column ids **and** one `economics.invariants` leaf. `columns.shared.json` existence alone is fake green.

**ACCT-F345:** `buildBillPaymentLines` last tier = `operating_bank` fail closed. Never `resolveCashLikeAccountForCompany` in that function. TRANSP operating bank = WF …6103 / `QBO-1150040141`. Confirm at **function** scope, not file grep.

**Money:** WORM reverse via `reverseJournalEntryNoFlip`. No owner-gate on TRANSP 6103 after 2026-08-28 owner order.

**G2/9000:** detector (CC-2), not fail-closed. **G1:** `is_sample_data` writers. Cutover $0 OB / negative TEST bank = not a defect (`docs/lockdown/TEST-LABEL-G1-AND-CUTOVER-FALSE-ALARM-LAW-2026-08-28.md`).

Presence: this file + `scripts/verify-economic-columns-c25-c31-present.mjs` + standing directive §3.
