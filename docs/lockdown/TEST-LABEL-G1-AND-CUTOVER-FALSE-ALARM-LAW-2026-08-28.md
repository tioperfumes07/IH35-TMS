# TEST LABEL (G1) + CUTOVER FALSE-ALARM + 9000 DETECTOR + KEEP-ON-BOOKS (owner 2026-08-28 · PERMANENT)

**Answered = closed.** Do not re-file these as defects. Do not ask the owner again.

Canonical companions: `docs/lockdown/PARALLEL-BOOKS-CUTOVER-LOCKED-2026-07-16.md` · `docs/specs/STANDING-SESSION-DIRECTIVE.md` §6–§7 · `docs/lockdown/CREATE-TEST-THEN-VOID-LAW-2026-08-22.md`.

## 1. Cutover false alarms (intended design)

`PARALLEL-BOOKS-CUTOVER-LOCKED-2026-07-16.md` says: do **not** re-flag listed items as risk/gap/defect. **Opening balances are $0 on every TMS account by design** until they land as-of **03/31/2026** on Martin’s QBO-cleanup schedule. **“0 of N accounts have opening balances” is not THE blocker.**

A ledger with **no opening cash**, exercised with TEST disbursements, **must show a negative bank**. That is arithmetic, not a defect. TRANSP real cash at 03/31 lives in **QBO** (owner figure **$717,135.24**). Negative A/R / negative bank from TEST hops: **ignore; do not re-file.**

There is **no CPA** in this system. “Owner + CPA” reads as **owner only**.

## 2. $1,200 placeholders are sanctioned

§7 authorizes a clearly-fake placeholder (e.g. **$1,200** flat) **labeled TEST DATA**. Seats following that are **correct**. Do **not** file “test data in prod.”

## 3. G1 is the entire labeling finding

The software must **label** TEST so reports can exclude it when Martin loads **real** opening balances.

- **Defect:** `is_sample_data` stays **false** on JEs (and other money rows) even when the hop was labeled TEST. **`factoring.batch` has no column.**
- **Fix (CC-1):** propagate `is_sample_data` source→JE (already started on poster inherit — writers must **set true** on TMS TEST creates); add `is_sample_data` to `factoring.batch`; aging/balances/collections **exclude** sample. Do **not** invent classification on historical QBO-mirror rows. Do **not** DELETE TEST rows to “clean” tables (empty-table regression).
- **Not G1:** “test data exists.” That is sanctioned.

## 4. G2 / 9000 — detector, not fail-closed

QuickBooks ships **Ask My Accountant** so uncertain items land **visible**, not guessed or refused. Refusing a bill because a vendor has no default expense account **blocks operations QBO does not block**.

**Right fix (already CC-2 #16884):** post to 9000 **then auto-open a finding** so it cannot sit **silent**. Codex may cite QBO docs; **nobody builds fail-closed `ACCOUNT_MAPPING_MISSING` for unmapped category / missing vendor default** as the 9000 “fix.”

138/142 vendors with NULL `default_expense_account_id`: **real data gap, not urgent, not fail-closed.**

## 5. Keep on the books — no void freeze, no void-all-TEST

- **Keep** TEST (and defect-repair) transactions **on the books** so tables do not regress to **0**.
- **No void freeze** that blocks WORM reverse of a **true** posting defect (`reverseJournalEntryNoFlip`).
- **Void is allowed only** when the hop **is** testing void/reversal, or the document **must** be voided (duplicate, wrong entity, operator error). **Do not** void every TEST bill/expense/JE “because it is test.”
- Never DELETE financial rows. Void = reversal.

## 6. Seats

**CC-1 NOW = G1 only** (label + batch column + report exclude). Do not rewrite G2 as fail-closed. **CC-2** keep 9000≠0 detector. **CC-3** Devin unique VEND-F leftover on **current** healthz (Cascade N=0 code-audit ≠ Devin live unique — steal unique only). **Codex** `/dispatch`. **Devin** query-back; no new post-gl until G1 writers land. **Cascade** unique FINDING only; do not stamp CERTIFIED.

Presence: `scripts/verify-standing-directive-present.mjs` · `scripts/verify-economic-columns-c25-c31-present.mjs` (per-module recursive + catalog completeness) · `scripts/verify-module-progress-not-authored.mjs` · `scripts/verify-no-bulk-test-void.mjs`.

**ACCT-F345 reversals (auditor record, Neon 2026-08-28):** `e8010d5a` → `4b8cf4e6`; `e12d04d9` → `ed9c6b13`; `dcbe5700` → `aad79450`. PR #17033 body said they were pending; they had already run.
