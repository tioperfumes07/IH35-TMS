# P3-LOCAL-DB-FIX-1: locations-expansion verify fails on local DB drift

## Status
Pre-existing local-env gap. Caused by 0036 migration rerun workaround leaving location_type as text instead of enum locally.

## Reproduction
npm run db:verify:locations-expansion
Error: idx_locations_type is used on type-filter explain ->
       EXPLAIN plan did not include idx_locations_type

## Cause
Same root as P3-MIGRATION-FIX-1: migrations are not idempotent. When migration 0030 fails, downstream migrations that should re-establish the location_type enum + idx_locations_type don't apply, so local DB drifts from production.

## Fix sketch
(a) Fix P3-MIGRATION-FIX-1 first (idempotency on 0030).
(b) Then run a one-time local repair migration that restores location_type enum and rebuilds idx_locations_type.

## Priority
P1 — blocked by P3-MIGRATION-FIX-1.

## Owner
TBD.
