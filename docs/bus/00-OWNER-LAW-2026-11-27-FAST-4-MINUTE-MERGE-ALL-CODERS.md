# OWNER LAW — FAST 4-MINUTE MERGE · ALL CODERS · 2026-11-27 17:44 CT (23:44 UTC)

Owner, verbatim: "bypass unecessary checks, if tested locally and passed then automatically use fast merge law, the fast 4 mintue
weekend merge method, it is a law. you and all coders instruct in repo. no wasting time"

## What every coder does (every seat: LEAD, P1, CC1, CC2, CC3, Cursor, Devin …)
1. Run the tests and guards **you touched** locally. They pass → go on. No waiting on the full CI matrix.
2. `git push` the branch, open the PR (REST: `gh api repos/tioperfumes07/IH35-TMS/pulls -f title -f head -f base -F body=@file`).
3. Immediately: `scripts/fast-merge.sh <PR> <branch>` (run it in the background). It waits 4 minutes from the push, prints every
   red CI check, and squash-merges with the PR's own title. No owner action, no second approval.
4. A red check that is your PR's own → fix it in your next PR, same session. A red that is not yours (base red, frozen trucking
   data) → one line on the PR saying so.
5. Post the merge on `~/Desktop/00-PERFUME-SEATS-SHARED-BOARD.md`.

## Still never (repo security law, unchanged)
`--no-verify` · hooks disabled (`core.hooksPath=/dev/null`) · force-push · `gh pr merge --admin` · secrets in code · test or
sample rows in production.
