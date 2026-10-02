# LEAD ORDER — 2026-10-02 — CC-1 — REHEARSE AND MERGE ACCT-F9633 (ONE FACTOR RESERVE ACCOUNT)

**OWNER'S WORD, THIS HOUR:** "Have any coder resolve the issue."
This is that order. It is assigned to CC-1 and CC-1 carries it to a merged PR. **No handoff back to
Lead, no partial.** You own it end to end.

---

## WHAT EXISTS ALREADY — DO NOT REBUILD IT

Commit `0c911dde5a` is authored, committed and gate-clean on 27 of 28 local phases. It carries:

| File | What it is |
|---|---|
| `db/migrations/202615220000_coa_one_factor_reserve_holdback_retire_1236.sql` | renames 1230 → "Factor Reserve Holdback", follows the role and binding rows, repoints the Faro reserve bank account off duplicate 1236 onto 1230, retires 1236 **only** if nothing references it, asserts the end state in the same transaction |
| `scripts/verify-escrow-vocabulary.mjs` | the guard that stops a third account being created by the same wrong word. Selftest 9/9. Comment-stripped, three precise rules |
| `scripts/verify-escrow-vocabulary.baseline.json` | 33 pre-existing fused identifiers, **shrink-only** |
| `scripts/money-pr-local-gate.mjs` | the guard wired into the gate after `verify-no-merge-conflict-markers` |
| `db/migrations/CLAIMED-MIGRATION-NUMBERS.json` | the claim for 202615220000 |

The ruling behind it: `docs/bus/00-LEAD-RULING-2026-10-02-TWO-ESCROWS-1230-STANDS-1236-RETIRED.md`.
Read it before you touch the SQL. **DRIVER ESCROW is a liability (2100 series). FACTOR RESERVE
HOLDBACK is an asset (1230).** Opposite sides of the balance sheet. One word must not name both —
that is how 1236 got created on 09-30.

---

## THE ONE THING BLOCKING IT — AND IT IS A CORRECT GUARD

```
verify:data-migrations-rehearsed FAILED:
  - 1 migration(s) mutate EXISTING rows (202615220000_coa_one_factor_reserve_holdback_retire_1236.sql)
    but the commit message has no "REHEARSED:" line. A fresh-database replay passes VACUOUSLY on an
    empty table — that is how 202610260000 went green in CI and then blocked production deploys for
    ~5.5 hours.
```

The guard is right and it is not to be weakened, baselined, exempted or worked around. My migration
UPDATEs live rows and DELETEs a chart-of-accounts row. A fresh-database replay proves nothing about
that. **Rehearse it for real.**

---

## WHAT YOU DO — 1 of 1

1. **Branch in your own lane.** Cherry-pick, do not re-author:
   ```
   git fetch origin && git switch -c cc-1/acct-f9633-one-factor-reserve-holdback origin/main
   git cherry-pick 0c911dde5a
   ```
   The migration number `202615220000` has HH=00, inside **your** band (HH 00–05), so it needs no
   renumber and crosses no lane. That is why this landed on your queue and not CC-3's.

2. **Rehearse on a Neon branch forked from production.** Fork `br-fancy-credit-akjnd07a` — real
   constraints, real triggers, real policies, **real rows**. Apply the full pending chain in order,
   not my migration alone. Record what actually changed: rows renamed, the bank account repointed,
   whether 1236 was retired or whether the assertion refused it and why.
   **This is a forked branch, not production. It is not seeding, not feeding and not a live write to
   USMCA — it is the only honest way to prove an UPDATE before it reaches the owner's data.**

3. **If the guarded retirement RAISEs** — 1236 still carries postings, a bank account, a role or a
   binding — **stop and report the counts on the bus.** Do not delete the reference to make the
   migration pass. A chart-of-accounts row with history behind it is never deleted; if 1236 has
   history, the answer is to deactivate and hide it, and that is a ruling I will give on the numbers
   you paste, in the same hour.

4. **Add the line to the commit message** — `git commit --amend`, keeping `FINDING: ACCT-F9633` as the
   first content line (a `#` prefix makes git strip it):
   ```
   REHEARSED: Neon branch br-… forked from br-fancy-credit-akjnd07a — chain applied in order, N rows changed
   ```
   Real branch name, real count. Not a placeholder.

5. **FAST-MERGE, 4-minute method.** `docs/bus/FAST-MERGE-4MIN-LAW.md`:
   gate (`node scripts/money-pr-local-gate.mjs`, exit 0 — that exit 0 **is** the merge proof) → one
   push, hooks ON, never `--no-verify` → `gh pr create` → `gh api --method PUT repos/tioperfumes07/IH35-TMS/pulls/N/merge -f merge_method=squash`.
   **Neon comes AFTER the merge, never before.** The migration applies to production through Render's
   pre-deploy step on merge; you do not apply it by hand.

6. **Report on the bus:** the merged PR number, the gate's exit 0, the REHEARSED line with its real
   branch and row count, and the post-deploy proof — 1230 named "Factor Reserve Holdback", 0 rows at
   account_number 1236, and the Faro reserve bank account resolving to 1230. One query, pasted.

---

## WHAT YOU DO NOT DO

- Do not weaken, baseline or exempt `verify-data-migrations-rehearsed`.
- Do not add a key to `verify-escrow-vocabulary.baseline.json`. It may only **shrink**.
- Do not apply the migration to production ahead of the merge.
- Do not touch 1235 "Faro Cash Reserve". It is consistent and both pools stay.
- Do not write a test, sample or demo row into USMCA. Not for proof, not under an AUTH.

This item is **26 of 26** on your queue — it goes to the front, because it blocks the chart of
accounts and every reserve figure on Factoring and Banking disagrees until it lands.
