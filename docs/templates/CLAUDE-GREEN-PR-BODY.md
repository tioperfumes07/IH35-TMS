# Claude-green PR body + commit message (copy verbatim shape)

**Use this for every Cursor PR.** Same text in the commit message and `gh pr create --body`.
Do **not** wrap it in `## Summary`. Start with `FINDING:`.

```
FINDING: SAF-C01
LANE: NON-FINANCIAL

ROOT CAUSE: <one or more paragraphs naming the mechanism>

FIX: <what changed at root; name guard + verify-step>

DOD-A: PASS
DOD-B: N/A
DOD-C: PASS
DOD-D: N/A
DOD-E: PASS
VERIFY-1: PASS
VERIFY-2: N/A
VERIFY-3: PASS
VERIFY-4: PASS
VERIFY-5: N/A
VERIFY-6: N/A
VERIFY-7: PASS
VERIFY-8: PASS
MODULE_PROGRESS: safety 26 of 38
ITEMS_TOUCHED: SAF-C01
MIGRATE: N/A

GUARD: scripts/verify-<name>.mjs + scripts/verify-steps/NNNN-verify-<name>.mjs
LIVE PROOF: node scripts/verify-<name>.mjs --selftest exit 0; live run exit 0; verify-definition-of-done-evidence OK on this single-commit range.
REMAINING: <honest open work — never "module done" while N of M incomplete>
```

## Local gate before create/edit

```bash
node scripts/money-pr-local-gate.mjs
node scripts/cursor-pr-body-gate.mjs --body-file /tmp/pr-body.txt
gh pr create --body-file /tmp/pr-body.txt   # or: gh pr edit N --body-file /tmp/pr-body.txt
```

## Reference green PR

Merged Claude example: #4073 (FINDING-first, LIVE PROOF with `tsc 0` / `verify-static OK`, gaps in REMAINING).
