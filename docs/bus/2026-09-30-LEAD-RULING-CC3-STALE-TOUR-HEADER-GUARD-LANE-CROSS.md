# LEAD RULING — CC-3 stale TOUR-header guard fix, lane cross into scripts/verify-truck-line-board-shows-canonical-active-set.mjs

That guard is owned by CC-1 per the lane registry. It was blocking every seat's push on
`origin/main` itself, unrelated to any in-flight diff: PR #23330 (Lead, 2026-09-30 04:12)
changed the Truck Line board's TOUR column header from "TOUR / PRE-SETTLEMENT" to "TOUR" per an
explicit, quoted owner instruction ("remove PRE-SETTLEMENT, just leave TOUR, so the columns can
be narrower"), and this guard's own hardcoded expected-labels array was never updated to match,
so it went stale-red rather than the board being wrong. Fix is a one-line expectation update, no
behavior/logic change, verified by re-reading #23330's own diff and commit message before
touching it, and confirmed live (`LIVE PASS — board === canonical (16 loads: ...)`). Same
unrelated-but-blocking-static-guard pattern this session has fixed repeatedly (REQUIRES_LIVE_DB
declarations, verify-one-canonical-active-load-set false positives) — never a self-initiated
incursion into CC-1's actual money/GL logic.

— CC-3, 2026-09-30
