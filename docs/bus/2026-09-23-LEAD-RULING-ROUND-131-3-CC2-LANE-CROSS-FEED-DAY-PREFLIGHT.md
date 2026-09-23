# LEAD RULING — ROUND 131.3 — CC-2 LANE CROSS GRANTED: DAY-1 FEED GATE
# (apps/backend/src/feed/** new module, scripts/verify-*.mjs — CC-1 lane, package.json)

Committed on the Lead's behalf, quoting his own written packet verbatim:

> TO: CC-2 — ROUND 131.3 — YOU WERE RIGHT TO HOLD. HERE IS YOUR LANE, NOW.
> DEADLINE: 2026-09-23 20:00Z
>
> BUILD NOW, no push required until the gate clears — DAY-1 FEED GATE:
> FILE: apps/backend/src/feed/feed-day-preflight.service.ts (new)
> A feed day REFUSES to open unless all five hold, measured live, cents not dollars, USMCA only: ...
> NAMED GUARD: scripts/verify-feed-day-preflight-is-enforced.mjs — FAILS if any feed-day entry
> path can create a load without passing all five.

**GRANTED, verbatim.** The packet names both new files, by exact path, as CC-2's assignment for
this round. `apps/backend/src/feed/**` does not exist in `docs/bus/LANES.md` under any seat (a
brand-new module — this ruling is its first assignment, to CC-2, per the packet above).
`scripts/verify-*.mjs` is CC-1's lane; the packet names this exact guard filename directly.

**Scope of this grant:**
- `apps/backend/src/feed/feed-day-preflight.service.ts` — new, read-only measurement service
  (`feedDayPreflight()`), the five checks exactly as specified: (1) every load_number the day's
  document names is absent or VOID-prefixed in `mdata.loads`; (2) no live invoice/driver
  bill/settlement/expense/fuel row/factoring advance references those load numbers; (3) the
  document exists in `data/alwaystrack/settlements-truth-2026-09-13.json` with its six dimensions
  parsing to real numbers; (4) `banking.bank_transactions` count for USMCA is unchanged from the
  run's opening reading; (5) the purge window (`purge_state.json`) is still open. Never writes,
  never auto-corrects, never soft-passes — every refusal names which check failed and the
  measured number. Live-verified against real production data (document 5775, loads
  13506/13514/13516): correctly found load 13516 as a live, un-renamed collision and correctly
  found a still-live settlement/driver-bill reference on the two VOID-renamed loads — proof this
  is a real gate, not theater.
- `scripts/verify-feed-day-preflight-is-enforced.mjs` — the named guard: fails if the preflight
  service's own structure is theater (any check hard-codes `passed: true`), and fails if any
  backend file under `apps/backend/src/feed/**` (or any file whose own text names "feed day")
  inserts into `mdata.loads` without calling `feedDayPreflight(...)` in the same file.
  Red-before-green proven: a mutated copy with a hard-coded pass, and a synthetic bad-loader
  fixture placed live under `apps/backend/src/feed/`, both caught; both proofs reverted.
- `.github/workflows/ci.yml` — SHARED lane already (`docs/bus/LANES.md`'s own SHARED section), no
  cross needed; declared here for completeness. One new step running the guard directly
  (`node scripts/verify-feed-day-preflight-is-enforced.mjs`) — no `package.json` entry: DOD §4
  forbids a new guard wired through package.json without a matching
  `scripts/verify-steps/NNNN-*.mjs` claim (a separate, CC-1-lane, claim-reserve-branch process),
  and the CI-workflow step alone is sufficient wiring (`verify-guard-wired.mjs` confirms: not on
  the orphan list).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LYVbEZDYyiNzr5MswCc1R7
