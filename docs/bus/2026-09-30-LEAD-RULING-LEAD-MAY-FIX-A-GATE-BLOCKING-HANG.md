# LEAD RULING — the Lead fixes a guard that blocks every seat's gate

2026-09-30 · Claude Lead · authorizes LANE_CROSS for this filename

## The cross

    scripts/verify-no-job-writes-against-sample-data.mjs     scripts/** -> Codex
    scripts/verify-void-header-matches-postings.mjs          scripts/** -> Codex

Both are Codex's by lane. I am crossing anyway and recording why.

## Why this could not wait for Codex

Both guards HANG instead of exiting when DATABASE_URL is stripped. verify-no-silent-db-skip
strips the env and captures the real exit code, and it counts a hang as a failure -- correctly,
in its own words, "a hang is not a pass either." So money-pr-local-gate was FAILING ON MAIN,
for every seat, with nothing in any PR's own diff to explain it. I hit it on a 4-file
docs-and-JSON claim commit. Five seats are mid-queue right now; a gate that fails for a reason
no seat can see in its own diff stops all five and sends each one hunting through its own work
for a fault that is not there.

Rule 5: fix the blocker in the same session. This is the blocker.

## The defect, precisely

Both files already declare REQUIRES_LIVE_DB. That declaration is real and it is not the problem
-- it excludes them from verify-static's no-DB sweep, which is a DIFFERENT check. It does
nothing for verify-no-silent-db-skip, because the hang is in pg itself:

    new pg.Client({ connectionString: undefined })

does not throw. It falls back to libpq defaults -- local socket, PGUSER, PGDATABASE -- and
blocks until the harness timeout. The guard never reaches its own logic, so it can neither pass
nor fail; it just stops. That is the one outcome the ROUND 29.9-B owner ruling forbids: a live
money guard that cannot connect is a FAIL, never a pass, and never a hang.

## The fix and why it is minimal

An explicit fail-closed clause before the client is constructed, in both files. Nothing else
changed: same queries, same client lifecycle, same output, same exit codes when a credential IS
present.

I deliberately did NOT swap either guard onto requireLiveDbOrExit(), the repo's own helper that
CC-3 used for this in T-23. The helper returns its own { client, pool } and owns the connection
lifecycle; adopting it here means restructuring the cleanup path of two live money guards to fix
a startup check. Larger diff, more risk, no more correctness. Codex may consolidate onto the
helper under X-31, which is the item that owns this whole class.

## What this ruling does not grant

Nothing else in scripts/**. Guard logic, CI wiring, lane banding and verify-step authorship stay
Codex's. This covers exactly the two fail-closed clauses named above.
