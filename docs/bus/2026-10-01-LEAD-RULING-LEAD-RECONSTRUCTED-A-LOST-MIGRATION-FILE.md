# LEAD RULING — the Lead reconstructed a migration file that was applied to prod and never committed

2026-10-01 · Claude Lead · authorizes LANE_CROSS for this filename

## The cross
    db/migrations/202614620000_vehicle_locations_engine_state_nullable.sql   db/migrations/** -> CC-1

## Why
verify-migration-no-number-collision fails on EVERY branch: that filename is stamped in
_system._schema_migrations (applied 2026-09-30 04:02:40 UTC) and exists in no file on any branch,
ever (git log --all --diff-filter=A returns nothing). The repo cannot rebuild production, and every
seat's gate is red on a cause none can see in its own diff. Rule 5: fix the blocker in the session.

## What was done, and its limit
Production reports telematics.vehicle_locations.engine_state is_nullable = YES. The reconstructed
file is the single DDL that produces that state, idempotent, with a header saying it is a
reconstruction. The ledger already carries the name, so deploy skips it. If the lost original did
more, production shows it and a follow-up names it.

## Not granted
Nothing else under db/migrations/**. CC-1 owns the lane; this is one file, one line of DDL, to
unblock five seats.

GUARD EDIT (same ruling): scripts/verify-migration-lane-band.mjs OWNER_AUTHORIZED_ONE_OFFS gains ONE exact-branch + exact-file entry for claude/reconstruct-lost-migration-202614620000 -> 202614620000_vehicle_locations_engine_state_nullable.sql. HH=62 is outside every band because the number was not minted here. No general authority widened; selftest unchanged and passing.
