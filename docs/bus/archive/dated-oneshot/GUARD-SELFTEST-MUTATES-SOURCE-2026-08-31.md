# FINDING — GUARD SELFTESTS MUTATE TRACKED SOURCE · 2026-08-31 23:55Z
Surfaced by CC-3 hitting it live. Counted and root-caused by Claude on `origin/main`.

## THE COUNT
```
guards that BOTH selftest AND writeFileSync        611
  ...that restore in a finally block               401
  ...with NO finally at all                        210   <- corrupt the tree on ANY failure
```
The 401 with a `finally` still do **not** survive `SIGKILL` — which is exactly what hit CC-3: a
killed `verify-static` run left `apps/backend/src/dispatch/book-load.service.ts` mutated in the
shared working tree, plus two orphaned `scripts/.settlements-qbo-chrome-selftest-*` dirs.

## ROOT CAUSE — and the fix is one rule, not more finally blocks
**A selftest must never mutate tracked source.** It must copy the target to a temp path, plant the
failure in the copy, and assert against the copy. Nothing in the working tree is ever touched.
Adding more `finally` blocks does not fix this — a `finally` cannot run through a kill.

**Guard for it (CC-2, add to P-A):** no `scripts/verify-*.mjs` may `writeFileSync` into `apps/` or
`packages/`. Selftest included. Give it a selftest and **name it in a workflow** — otherwise it
joins the 4,490 that never run.

## VERIFIED: this is NOT the booking P0
`origin/main`'s `book-load.service.ts` is clean — 2,272 lines, no selftest sentinels. The mutation
never left CC-3's local tree. **Devin-A's #18892 `MissingRequiredChip` 404 is a separate bug and the
hunt continues.**

## SECOND FINDING — the underlying hazard
Multiple seats share ONE working tree. That is what made CC-3's own debris look like another seat's
work and put it one keystroke from stashing `docs/module-completion/vendors.md`, which belongs to
someone else. **Report it. Nobody fixes it unilaterally.**

## STANDING RULE ADDED
**Never `git stash` another seat's uncommitted work in a shared tree.** If a pop collides, or another
process writes while it is stashed, that seat loses work and will not know why. `git push` does not
require a clean tree — if a pre-push hook demands one in a shared worktree, **the hook is wrong.
File it; do not work around it by touching a file that is not yours.**
