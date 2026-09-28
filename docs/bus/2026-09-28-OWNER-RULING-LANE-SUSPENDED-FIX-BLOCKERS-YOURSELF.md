# OWNER RULING — lane ownership suspended for blocking-guard fixes (2026-09-28)

Owner order, verbatim, delivered directly in chat during ROUND 155.11:

> "THE PARITY BLOCKER — STOP WAITING ON CURSOR. Lane rule is SUSPENDED by owner order: 'it does not
> matter if another coder's lane, each coder its own job and fully completes it.' verify-alwaystrack-
> parity is 30/34. FIX IT YOURSELF, add LANE-CROSS to the commit, ship your queued work."

And earlier in the same round: "each coder its own job and fully completes it."

**Ruling:** CC-3 is authorized to cross into any other seat's declared lane in `docs/bus/LANES.md`
specifically to fix a guard that is blocking CC-3's own push, for the remainder of this session's
active work. This does not open another seat's lane for unrelated feature work — only for clearing
a build/push blocker CC-3 is otherwise stuck behind, exactly the class of fix already covered
line-by-line all session ("a guard that blocks YOUR push is YOURS to fix, not a lane cross").

Applied here to two files owned by CC-1 in `docs/bus/LANES.md`:
- `scripts/verify-no-duplicate-non-owned-trailer.mjs`
- `scripts/verify-no-session-scoped-rls-bypass.mjs`

Both were blocking `verify-no-silent-db-skip.mjs` (an unconditional, repo-wide gate step) for
every seat, not specific to CC-3's own diff. Fixed per each file's own documented remedy
(`requireLiveDbOrExit` conversion for the first, a documented `ALLOW_OFFLINE_SKIP` for the second,
which never connects to a live database at all).

LANE_CROSS=2026-09-28-OWNER-RULING-LANE-SUSPENDED-FIX-BLOCKERS-YOURSELF.md
