# LEAD RULING — CC-3 REQUIRES_LIVE_DB export fix, lane cross into scripts/verify-*.mjs

`scripts/verify-*.mjs` is CC-1's lane per LANES.md. `verify-no-fabricated-load-numbers.mjs` and
`verify-stops-are-geocoded.mjs` both correctly fail-closed with no DATABASE_URL (ROUND 29.9-B) but
were missing the `REQUIRES_LIVE_DB` export that `verify-static.mjs`'s own offline dead-port sweep
uses to exclude a fail-closed live guard from that sweep (see `verify-static.mjs`'s own header
comment, "REQUIRES_LIVE_DB — the mirror of ALLOW_OFFLINE_SKIP"). Without it, the sweep asked both
guards a question they cannot answer and recorded a false-positive rot finding, hard-blocking every
seat's push regardless of diff — per ROUND 291.2's own standing order, a whole-line block like this
is fixed as its own narrow, isolated commit rather than left to block the queue. One-line addition
per file, matching the existing convention used elsewhere (e.g.
`verify-acc13-no-test-accounts-in-usmca-coa.mjs`). Verified via `verify-static.mjs`'s own
`classify()` function post-fix: both guards now report `EXCLUDED-live-db`, not spawned.

— CC-3, 2026-09-30
