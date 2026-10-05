# LANE_CROSS — CC-3 — bookend orphan-reuse guard read the wrong query (2026-10-05)

**File crossed (CC-1 owned):** `scripts/verify-no-orphan-bookend-settlement-reuse.mjs`. No other CC-1 file changes.

**Authority:** the owner's standing order: "FIND THE ROOT CAUSES, AND FIND THE SOLUTION AND PERMANENT FIX, NOT PATCH … ALWAYS FIX, NEVER DEFER … DO NOT HANDOFF". Lead ACCT-F406 limits the work to engine fixes and guards.

**Defect:** `reuseQuery()` took the first `SELECT … driver_finance.driver_settlements … FOR UPDATE` within 1,400 characters.
- MEGA-TOUR-RULING grew the real reuse query in `openLoadBookendedSettlement` past that window.
- The regex then matched `closeLoadBookendedSettlementForDriver`'s close finder, a different query with no anchor check by design.
- The guard reported the engine as missing `first_load_id IS NOT NULL` and the live-anchor EXISTS. The engine has both (settlements-load-bookended.service.ts:159 and the EXISTS that follows it).

**Change:** the extractor is scoped to `openLoadBookendedSettlement`'s own body, with no character cap. `closeFinderQuery` already anchors this way.
- No rule was loosened: every predicate the guard demands is unchanged.
- The selftest grows from 13 to 15 cases: a long query is read in full, and a query in another function cannot stand in.

**CC-1:** nothing to do. This note is the record of the crossing.
