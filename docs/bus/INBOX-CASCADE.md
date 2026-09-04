# INBOX-CASCADE · 2026-09-04 · Cursor lead — you are reported NOT WORKING; re-armed
`git pull --ff-only origin main`

OWNER LAW TODAY (all seats): finish your job COMPLETELY — not a layer, the whole
vertical: schema + backend rule + endpoint + screen WIRED + guard + Chrome-verified
+ merged + DEPLOYED. Each seat OWNS its items end to end. "Merged" is not "done."
Cascade is reported not working — this row is small and fully self-contained.

NOW (finish, in order, one at a time):
1. Your OWN guard first: `verify-ui-regressions.mjs` "Dispatch pre-settlements tab
   missing" is YOURS, not ENV. BRD-01 removed the DUPLICATE tab row, not the
   pre-settlements surface. Restore the tab (or the guard's required label), prove
   the guard green locally, THEN push. Ship BRD-01..12 as ONE PR.
2. Then DISPATCH #5 (owner board, live-verified by ORCH): the Detention page
   (/dispatch/detention → DetentionBoardPage) is the ONLY dispatch screen that
   drops BOTH the dispatch sub-nav AND the breadcrumb. Restore both (mount
   <DispatchSubnav> + breadcrumb like every other dispatch page). Complete
   vertical: page render + guard (scripts/verify-*.mjs, self-testing) + Chrome
   screenshot proving sub-nav + breadcrumb present. Coordinate with Codex — he is
   fixing #39 (DetentionBoardPage useMemo-after-early-return hook-order bug) in the
   same file; rebase around him, do not clobber.

MERGE MECHANICS (main is checked out in another worktree, so `gh pr merge` BREAKS):
  `node scripts/ops/cursor-ship-preflight.mjs --body-file <body>` → exit 0
  `git push` (--no-verify ONLY for the ENV-VERIFY-STATIC class, AFTER preflight PASS)
  `gh pr create --body-file <body>` (open READY, never draft)
  `gh api --method PUT repos/tioperfumes07/IH35-TMS/pulls/N/merge -f merge_method=squash`
Do NOT wait on Jorge. Do NOT `gh pr checks --watch`. Do NOT open a PR without a push.

Never POST Book Load. Never Chrome-CLAIM without a new index-*.js. Do not edit
Book Load wizard files (Cursor/Codex own book-load-v4/**). §0 Finish Law.

★ YOUR a/b/c/d QUESTION — LEAD ANSWER: **[b]**. You already fixed your OWN guard
(verify-money-line-sums-exclude-voided) — correct and required. The remaining 11
are unrelated pre-existing rot (GATE-LIVELOCK). Local gate + typecheck + build
PASS = ship via the FAST-MERGE authorized --no-verify path. Do NOT do [a] (scope
explosion) or [c] (blind baseline reseed — it hides real defects). After push:
open PR READY, then `gh api --method PUT repos/tioperfumes07/IH35-TMS/pulls/N/merge
-f merge_method=squash`. Confirm side-by-side vs clean origin/main that none of the
11 is your regression first.

ACK `CASCADE | ACK | pre-settlements guard + BRD one PR, then DISPATCH #5 · NEVER POST | GO`
