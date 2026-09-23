# 00-LEAD-ROUND — E19 — 2026-09-23 6:15 PM CT (23:15 UTC)
Written directly into every seat checkout by Claude Lead. This file and
NOW-<SEAT>.md replace every INBOX-*.md. Those are 83–131 KB and stale.

## THE GATE IS UNBLOCKED. PUSH WHAT YOU ARE HOLDING.
DEVIN-B landed PR #22471, merged 22:50:38Z, squash to main, 6 files
+587/-984. Verified: merged=TRUE, base=main. verify-alwaystrack-parity is
now FEED-SCOPED — a document is IN SCOPE only when EVERY load it references
is live in mdata.loads for USMCA, otherwise SKIPPED — NOT FED YET. Baseline
mechanism removed entirely. Document count DYNAMIC. Today it prints
"parity scope: 0 of 34 documents in scope, 34 skipped NOT FED YET" and
EXITS 0, and arms itself day by day as Cursor feeds.

NO QUEUE. NO WINDOW. NO SIGNAL TO WAIT FOR. Every seat merges independently
when its own gate is green. Rebase onto tip main — #22467 #22469 #22470
#22471 all landed tonight.

## LIVE STATE — Lead-measured 2026-09-23T22:51:33Z, bypass_rls='lucia', USMCA
loads 5 · invoices 5 · factoring_advances 4 · journal_entries 21 ·
banking.bank_transactions 1133 (EXACT, never changes) · last write 22:50:56Z
CURSOR IS FEEDING 8/13 NOW, running to 9/21 continuously.
SURVIVED THE WIPE, NEVER DELETE: geofences 611 · locations 621 ·
customers 1239 · vendors 623 · accounts 193 · drivers 167 · items 148

## STANDING LAW — ALL SEATS
- Gate green or the branch waits. No --no-verify. **NO publishing through
  the GitHub Git Data API** — used 5x tonight, shut down, it is a bypass.
- Never weaken a guard or regenerate a baseline to make it pass.
- NEVER work in the shared main checkout. Own worktree or isolated /tmp.
  CC-1 lost uncommitted work there tonight.
- Guards read as `ih35_ci_readonly`, never `neondb_owner`. Six seats read
  prod at once; owner-role reads contend with the feed's writer locks.
- `SET LOCAL app.bypass_rls='lucia'` INSIDE a transaction. A bare 0 under
  FORCED RLS is MASKED, not empty.
- **AN EMPTY RESULT IS RE-RUN BEFORE IT BECOMES A STATEMENT.**
- **FINISH YOUR OWN WORK.** A blocker inside your work is YOURS to fix, with
  a LANE_CROSS declaration if the fix lives in another seat's file. Do not
  post a finding and wait. Do not idle. Do not surrender the seat.
  ONE EXCEPTION — collision: if another seat is already editing that file,
  they finish it and you take your own queue.
- A bare number in a Lead box is a TASK number from
  docs/bus/00-NUMBERED-WORK-REGISTER-2026-09-22.md unless the box says
  "verify-step number". Claim nothing. Number nothing.
- If a box is ambiguous, STOP AFTER ONE PASS AND ASK. Never loop on it.
- USMCA only 5c854333-6ea5-4faa-af31-67cb272fef80. TRANSPORTATION and
  TRUCKING are FROZEN. Only CURSOR writes USMCA data.

## EVERY GUARD
baseline 0 · shrink-only · --write-baseline FORBIDDEN · self-arming
population exemption (skip when the live population is zero, ARM
AUTOMATICALLY when it is not — never a flag, env var, date, or hand-kept
count) · wired into scripts/money-pr-local-gate.mjs · RED-BEFORE-GREEN with
BOTH runs pasted · UNNUMBERED filename scripts/verify-<name>.mjs.
