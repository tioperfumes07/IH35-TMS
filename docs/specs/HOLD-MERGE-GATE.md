# HOLD-MERGE-GATE

Root-cause control for the **2026-06-20 near-miss**: a leftover background `gh pr merge` loop
title-blindly merged 5 `[HOLD-FOR-JORGE]` PRs (#1266–#1270) that were meant to stay open for Jorge.
Impact was zero only because they were design docs, not posting code. **A title is a request, not a
control.** This gate is the control.

## What it does
`scripts/verify-hold-merge-gate.mjs` runs as the CI job **`hold-merge-gate`**
(`.github/workflows/hold-merge-gate.yml`) on every pull request. It marks a PR **PROTECTED** if ANY of:

- the **title** contains `[HOLD-FOR-JORGE]` (case-insensitive), OR
- a changed file matches a **protected path glob**: `**/*posting*.ts`, `**/*posting*.mjs`, OR
- a changed **migration** (`*.sql` / `**/migrations/**`) is **NOT provably additive-new-table**
  (CREATE-TABLE-only neutral, 2026-06-20). A migration is **neutral** only if it `CREATE TABLE`s a new
  table and does nothing dangerous — **no** `ALTER TABLE` / `DROP` / `DELETE FROM` / `TRUNCATE` /
  `UPDATE … SET`, **no** financial/accounting table reference (`accounting.*`, `payment`, `invoice`,
  `bill`, `ledger`, `journal`, `posting`, `tax`, `gl_/ap_/ar_`), and **no** `INSERT INTO` a table other
  than the one it just created (seeding its OWN new table is allowed). Anything else stays **PROTECTED** —
  conservative: if it can't be proven additive-new-table, it's protected, OR
- a changed **backend accounting/driver-finance `.ts`** file whose diff shows **GL-write markers**
  (`INSERT INTO accounting.journal…`, `journal_entry_postings`, `payment_applications`, post/JE helpers),
  OR
- the diff **flips a `*_ENABLED` / `*_FLAG` / `FEATURE_*` from false/OFF → true/ON**.

Verdict:

| Case | Result |
|---|---|
| PROTECTED **and** label `JORGE-APPROVED` **absent** | **FAIL (red)** — blocks merge |
| PROTECTED **and** label `JORGE-APPROVED` present | pass |
| not PROTECTED | pass (neutral) |

Content-based detectors (GL markers, flag-flip) skip `*.md`, test files (`*.test.*`, `*.spec.*`,
`__tests__/`), and the gate script's own fixtures, so prose/tests that merely *mention* a flag don't
false-positive. The migration analyzer and `*posting*` path globs still catch the dangerous cases
regardless. The script self-tests its full decision table on every run (`--self-test`, 27 cases incl. the
CREATE-TABLE-only migration matrix).

## The one human step Jorge does (once, in the GitHub UI)
1. **Make `hold-merge-gate` a REQUIRED status check** in branch protection on `main`
   (Settings → Branches → `main` → Require status checks to pass → add `hold-merge-gate`).
   Once required, a red `hold-merge-gate` **physically blocks merge** — the merge button and
   `gh pr merge` both fail. This is what stops a generic merge loop.
2. **Only Jorge applies the `JORGE-APPROVED` label**, by hand, after his Tier-1 ceremony — **never a
   script or token in an unattended run.** Applying/removing the label re-runs the job (the workflow
   triggers on `labeled`/`unlabeled`/`edited`), so the check flips green/red accordingly.

> Create the label once if it doesn't exist: `gh label create JORGE-APPROVED --color B60205 --description "Jorge-approved: clears hold-merge-gate after Tier-1 ceremony"`.

## Honest limitation
This gate stops **accidental / title-blind** merge loops and the merge button. It does **NOT** stop a
script that *deliberately* applies `JORGE-APPROVED` using Jorge's token, nor an admin force-merge. So the
standing operational rule still holds:

- **Kill all background merge-sweepers; never run a write-token `gh pr merge` loop during a HOLD window.**
- The label is a **human** act. Don't automate it.

## Verifying the gate (GUARD, before Jorge marks it required)
1. Open a throwaway PR titled `[HOLD-FOR-JORGE] gate test` touching a dummy docs file →
   `hold-merge-gate` goes **RED** → `gh pr merge` on it **fails**.
2. Apply the `JORGE-APPROVED` label → the check re-runs and goes **GREEN**.
3. A normal non-financial PR → check is **neutral/green**. Close the test PR.
