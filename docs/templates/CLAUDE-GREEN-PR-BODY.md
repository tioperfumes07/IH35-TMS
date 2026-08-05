# Claude-green PR body + commit message (copy verbatim shape)

**Use this for every Cursor PR.** Same text in the commit message and `gh pr create --body`.
Do **not** wrap it in `## Summary`. Start with `FINDING:`.
No “Made with Cursor”. No “DRAFT — WIP”. Title must match Rule 36:

```
Cursor- fix(<module>): <FINDING-ID> — <one-line defect>
```

## PR / commit body

```
FINDING: SAF-C01
LANE: NON-FINANCIAL

ROOT CAUSE: <one or more paragraphs naming the mechanism — measure on prod/code, not vibes>

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

## Local gate before create/edit (Rule 36 — Claude serial)

```bash
git fetch origin main
git rebase origin/main          # ALWAYS before push — tip-main
# Preferred one-shot (Rule 29 + Rule 36 tip-main fail):
node scripts/ops/cursor-ship-preflight.mjs --body-file /tmp/pr-body.txt

gh pr create --title "Cursor- fix(<module>): <FINDING> — <defect>" --body-file /tmp/pr-body.txt
# never --draft for finished work
```

## Reference green PR

Merged Claude examples: #4365 / #4339 / #4073 — title `Claude-1- fix(scope): ID — defect`, FINDING-first body, LIVE PROOF with command exits / prod counts, one commit on tip main, no parallel CLAIMED thrash.
