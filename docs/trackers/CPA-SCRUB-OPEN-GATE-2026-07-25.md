# CPA scrub — OPEN GATE, do not close until the re-sweep passes (2026-07-25)

**Status: IN PROGRESS.** Two PRs did most of the work, but the scrub is *not* complete and must not be
reported as complete until the check at the bottom returns 0 on the **merged** tree.

## What is done

| PR | what it did |
|---|---|
| **#3543** | committed 86 Lists+Safety block docs; 71 CPA-as-approver substitutions across 68 of them |
| **#3546** | atomic skill rename `ih35-cpa-accounting-decisions` → `ih35-accounting-decisions` (dir + `name:` field + 57 refs / 34 files, 0 residual); removed the CPA-grade/VETO gate framing from `.cursor/rules/11` and `CURSOR-OPERATING-CONSTITUTION` §83 |

## Why it is NOT closed — a merge-order coupling

#3543's 86 block docs still contain the **old** skill name. They are not on `origin/main` yet, so
#3546's repo-wide rename could not reach them. Guard **1501** strips the old literal before matching,
so it will keep passing and will **not** surface the staleness.

The two PRs are individually correct and each passes its own checks. The gap only exists in the
combination, which is precisely the kind of thing that gets reported as done and quietly is not.

## The re-sweep — required before anyone says "CPA scrub complete"

After **#3543 lands**:

1. Re-run the rename over `docs/blocks/` (86 files).
2. Update guard `1501-verify-block-docs-committed-and-owner-decides.mjs` — its `SKILL_PATH` constant
   still holds the old name.
3. Verify on the **merged** tree:

```
git grep -i ih35-cpa-accounting-decisions | wc -l    # must be 0
```

Until that returns 0, the scrub is in progress.

## Owner rulings that constrain the scrub — do not "fix" these

**KEEP `CURSOR-OPERATING-CONSTITUTION:18`** — *"as if it will be reviewed by a CPA, auditor, attorney,
insurance company, lender, customer, DOT/FMCSA reviewer, software architect, or court."*

Owner ruling 2026-07-25: this is the owner's own **quality bar**, verbatim from his standing rules. The
list names hypothetical external reviewers the work must withstand. It is **not** an approver gate and
grants no one authority over the owner. Removing "CPA" here would **lower the standard**, not remove a
gate. The line is annotated in place so a future strip pass does not delete it. If the owner later
wants literally zero instances of the token, drop only that one word from the list — the bar is
unchanged either way. Owner's recommendation on record: **keep**.

**KEEP `AICPA`** wherever it appears — the standards body that defines the SOC 2 Trust Services
Criteria. A citation, not an approver. Mangling it corrupts a real regulatory reference.

**The distinction this scrub is enforcing:** a *gate* was deleted; a *standard* was kept. Enabling
posting, flipping a flag and declaring the books trustworthy are the OWNER's sole decisions — there is
no external, CPA or accountant sign-off in this system. But the requirement that the work survive
scrutiny by a CPA, an auditor or a court is a bar, and bars stay.
