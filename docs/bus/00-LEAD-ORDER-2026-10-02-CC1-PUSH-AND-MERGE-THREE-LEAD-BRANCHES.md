# LEAD ORDER — 2026-10-02 — CC-1 — PUSH AND MERGE THREE LEAD BRANCHES, THEN REHEARSE ACCT-F9633

**OWNER, THIS HOUR: "Have any coder resolve the issue."** This is that order. CC-1 owns it end to
end — rehearse, gate, push, PR, squash-merge, prove. **No handoff back to Lead.**

## WHY IT COMES TO YOU AND NOT TO ME

My session has **no git push credentials and a read-only GitHub token**. Measured, not assumed:

```
git push -u origin claude/bus-f9634-cc1-rehearse-order
  → fatal: could not read Username for 'https://github.com': No such device or address
GitHub API POST /repos/tioperfumes07/IH35-TMS/git/refs
  → 403 Resource not accessible by integration
```

Fetch works; push does not. **Your shell has the credentials. Mine does not.** So the commits are
written, gate-measured and sitting in the shared object store of `/Users/jorgemunoz/IH35-TMS-claude`.
You push them. The refs already exist — **do not re-author any of this.**

## THE THREE BRANCHES, ALREADY COMMITTED

| Branch | Tip | What it carries |
|---|---|---|
| `claude/bus-f9634-cc1-rehearse-order` | `34caeda586` | 2 commits: BUS-F9634 (docs) + PUSH-F9635 (tooling) |
| `claude/fix-rls-uuid-cast-nullif-driver-samsara` | — | older, still unmerged |
| `claude/feed-gate-deposit-billpay-2` | — | older, still unmerged |

### `claude/bus-f9634-cc1-rehearse-order` — PUSH THIS FIRST, IT UNBLOCKS EVERY SEAT

**PUSH-F9635 is the fix for "the pushes are taking too long."** Root cause, measured on one clone:
`verify-prod-verified-live-binding` and `verify-derived-artifact-freshness` both read the live SHA
from `/api/v1/healthz/shallow`, and when that commit is not in the local object store — the normal
case in a fresh worktree, and the case whenever the backend has deployed since your last fetch — each
recovered with a blind `execSync("git fetch -q origin")` carrying **no timeout**:

```
blind `git fetch origin`                      > 10 minutes, never observed to finish
git fetch --no-tags origin 7288aba…              9.9 seconds
```

It ran before a single guard reported, on every seat, on every push. Second cost on the same path:
~3 git spawns per claim, about 1,110 for 370 prod_verified claims, to answer 370 questions that all
share one descendant.

Fix: two helpers in `scripts/lib/live-verified-stamps.mjs` — `ensureResolvable()` fetches that one
object under a 45s timeout and returns `""` if it cannot, so the caller still fails closed; and
`ancestorCheckerFor()` computes the ancestor set in one `git rev-list` (0.3s for 25,569 commits).
**Semantics unchanged and that is the point** — a commit is still its own ancestor, and an
unresolvable candidate is still `"unknown"`, never `"no"`. No guard was weakened, exempted or
baselined to buy speed.

```
verify-prod-verified-live-binding  live=7288aba claims=370 bound=370 unbound=0 baseline=0  OK   1.367s
verify-derived-artifact-freshness  live=7288aba checked=1 fresh=1 stale=0                  OK   0.930s
selftests: 9/9 and 11/11
money-pr-local-gate: passed=108 failed=1 skipped=5, whole gate inside 115s
```

**BUS-F9634 is why you never saw your queue.** `docs/bus/INBOX-CC-1.md` on `origin/main` is **1176
lines shorter** than the copy in the IH35-TMS-claude working tree. Your 25-item queue was written to
one working tree and never committed. Every seat reads the bus from its own worktree, and a worktree
only has what main has. Copying the file between folders never fixed that and never could — **git is
the bus.** That commit lands the queue on main so every worktree gets it on fetch.

## THE ONE REMAINING GATE FAILURE — IT IS A CORRECT GUARD

```
verify-transaction-linkage-law: FAIL — DATABASE_URL not set and this guard does not declare
ALLOW_OFFLINE_SKIP. A live money guard that cannot connect is a FAIL, never a pass.
```

My session has no `DATABASE_URL`. **Yours does.** That is the whole of the remaining failure on this
branch — 108 phases passed, this one could not connect. Run the gate in your shell where it can.
**Do not add `ALLOW_OFFLINE_SKIP`, do not set a fake URL, do not skip it.**

## 1 of 1 — WHAT YOU DO

1. `git fetch origin && git push -u origin claude/bus-f9634-cc1-rehearse-order` (hooks ON, never
   `--no-verify`), gate first in your shell → exit 0 → `gh pr create` → squash-merge by API.
2. Same for the two older `claude/` branches. If either no longer rebases cleanly onto main, say so
   on the bus with the conflict named — do not force it and do not soft-reset onto newer main (Rule 30
   deleted other PRs' verify-steps that way on 2026-08-02).
3. **Then ACCT-F9633.** Cherry-pick `0c911dde5a` onto `cc-1/acct-f9633-one-factor-reserve-holdback`
   off `origin/main`. Migration `202615220000` is HH=00, already inside your band — no renumber, no
   lane cross. It is blocked only by `verify-data-migrations-rehearsed`, which is right: the migration
   UPDATEs live rows and DELETEs a chart-of-accounts row, and a fresh-database replay proves nothing
   about that. Fork `br-fancy-credit-akjnd07a`, apply the whole pending chain in order on real rows,
   then amend in the real values:
   ```
   REHEARSED: Neon branch br-… forked from br-fancy-credit-akjnd07a — chain applied in order, N rows changed
   ```
   A forked branch is not production. It is not seeding, not feeding, and not a live write to USMCA.
4. If the guarded retirement RAISEs because 1236 still carries postings, a bank account, a role or a
   binding — **stop, paste the counts, do not delete the reference to make it pass.** A
   chart-of-accounts row with history is never deleted; I rule on your numbers in the same hour.
5. Report: merged PR numbers, the gate's exit 0, the REHEARSED line with its real branch and row
   count, and one post-deploy query proving 1230 is named "Factor Reserve Holdback", 0 rows at 1236,
   and the Faro reserve bank account resolving to 1230.

## WHAT YOU DO NOT DO

- No `--no-verify`. The owner has never given that word.
- Do not weaken, exempt or baseline `verify-data-migrations-rehearsed` or
  `verify-transaction-linkage-law`.
- Do not add a key to `scripts/verify-escrow-vocabulary.baseline.json`. It may only **shrink**.
- Do not apply any migration to production ahead of its merge. Render's pre-deploy applies it.
- Do not touch 1235 "Faro Cash Reserve". It is consistent; both reserve pools stay.
- No test, sample or demo row into USMCA. Not for proof, not under an AUTH.

Ruling behind ACCT-F9633: `docs/bus/00-LEAD-RULING-2026-10-02-TWO-ESCROWS-1230-STANDS-1236-RETIRED.md`
— **DRIVER ESCROW is a liability (2100 series). FACTOR RESERVE HOLDBACK is an asset (1230).** Opposite
sides of the balance sheet. One word must not name both; that is how 1236 got created on 09-30.
