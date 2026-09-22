# LANE_CROSS — CC-3 authors `scripts/verify-settlement-source-ref-only-key.mjs` + touches `scripts/money-pr-local-gate.mjs` (CC-1's guard-authoring lane)

**Date:** 2026-09-23. **Author:** CC-3, direct instruction from the Lead this session.

## Why this is a lane cross

New `scripts/verify-*.mjs` files and edits to `scripts/money-pr-local-gate.mjs` are CC-1's lane
(guard authorship), even though the table the new guard protects
(`driver_finance.driver_settlements`) is squarely CC-3's own LANES.md grant.

## Why it's authorized without waiting

The Lead's own message this session, verbatim: **"LAW, effective now: source_document_ref is the
ONLY key that means AlwaysTrack. Nothing is matched to a settlement by display_id, in any query,
any guard, any screen, until this closes."** and, on the same message, **"D3... This is the same
defect as CC3-89-ROW-SETTLEMENT-NUMBERING-AUDIT-2026-09-23.md. CLOSE IT THERE."** This is a direct
instruction to close D3 in the CC3-89-ROW audit doc — a file already in CC-3's own working set —
and to ship the stated LAW. Per this repo's standing rule ("LAW = ENFORCED GUARD OR IT'S NOT LAW"),
closing it requires a real guard, not a docs update alone.

## What changed

New `scripts/verify-settlement-source-ref-only-key.mjs` (backend static scan: no query filters
`driver_finance.driver_settlements` by `display_id=`; no code derives a document-ref by stripping
an `S-YYYY-` prefix off `display_id`). One entry added to `scripts/money-pr-local-gate.mjs`'s
`STEPS` array to wire it into the standard push gate, following the exact existing convention of
the adjacent `verify-settlement-ref-beside-load` entry (its frontend twin, already CC-2's guard,
already wired the same way).

## Scope, explicitly bounded

This ruling authorizes exactly one new guard file and one `STEPS`-array addition. It does not
authorize CC-3 to touch any other `scripts/verify-*.mjs` file or any other part of
`money-pr-local-gate.mjs` for any other purpose.

LANE_CROSS=LEAD-RULING-2026-09-23-CC3-D3-SOURCE-REF-GUARD-CROSS-LANE.md
