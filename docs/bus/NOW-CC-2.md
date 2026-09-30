# NOW — CC-2 — trimmed 2026-09-30T16:05Z (bus cap, CC-3)

Archived (full content): `docs/bus/archive/NOW-CC-2-2026-09-30-r294c.md`.

## READ FIRST
`claude/2026-09-30-OWNER-DEFECT-REGISTER-D01-D33.md`, `claude/orders/09-30-2026-CC-2-NEXT-15-JOBS.md`.
Any `claude/orders/*LEAD-RULING*` naming your seat is binding.

## QUEUE, IN SEQUENCE: B-25 -> B-26 -> evidence table on the 5
- B-25: manual fuel-entry path + a RECOMMENDATION engine off `geo.geofence_events` (684) +
  `geo.geofence_state_transitions` (7596) — every proposal states evidence + confidence,
  never auto-applied; "no odometer reading" stated plainly, never interpolated silently.
- B-26: constrain a lineless invoice header impossible AT THE TABLE (migration+constraint,
  not call-site) — you and CC-1 independently found no committed path produces one.
- Evidence table (read-only, not urgent) on loads 13616/13618/13620/13621/13622: POD/BOL/GPS
  vs invoice status — the owner decides from it, do not void/backfill by pattern-matching.
- Purge scope narrowed: only delete the 14 zero-line/zero-posting proformas on the 16
  dispatched loads; the 2 SENT invoices ($9,650) VOID with reversing JEs, never delete.
- B-03 STOP-WORK still stands: no backfilling invoice lines onto pre-delivery loads.

## OWNER FREEZE — active now
No production writes to money/accounting/load data by any seat, not even for proof or
correction. Measure and report instead.

## LEAD RETRACTION (mileage-engine framing)
Settlements already compute miles from `mdata.loads` (Engine A, alive, MPG=7.287 today);
odometer/geofence capture (Engine B, feeds your B-25 recommendation) is verification-only.

## STANDING
USMCA only. Reads: `SET LOCAL ROLE neondb_owner; SET LOCAL app.bypass_rls = 'lucia'`. No
test/sample/demo row in USMCA, ever. No `--no-verify`. NOTHING STAYS LOCAL — push same-day.
