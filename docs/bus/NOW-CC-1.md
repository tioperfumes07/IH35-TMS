# NOW — CC-1 — trimmed 2026-09-30T16:05Z (bus cap, CC-3)

Archived (full content): `docs/bus/archive/NOW-CC-1-2026-09-30-r294c.md`.

## READ FIRST
`claude/2026-09-30-OWNER-DEFECT-REGISTER-D01-D33.md`, `claude/orders/09-30-2026-CC-1-NEXT-15-JOBS.md`.
Any `claude/orders/*LEAD-RULING*` naming your seat is binding.

## QUEUE, IN SEQUENCE: A-20 -> A-21 -> A-23 -> A-22 -> A-24
- A-20: A-11 UI fix — wire the unfiltered "Transactions" mini-table to the Invoices page's
  own filters (do not remove it).
- A-21: ship the has-transactions predicate as ONE shared export (Customers + Vendors both
  call it; Cursor's C-19 default filter depends on this).
- A-23: test rows (`$25.00` CC-2 live-test check, `$1.00` AUTH-NNN proof lines, the A-12 test
  driver) — ENUMERATE ONLY (id/table/amount/created_at/created_by/every JE), do not delete.
  Delete is frozen by the owner order below.
- A-22: 120 unresolved item_ids ($4,901.31) — report named, never guess a mapping.
- A-24: A-12 linkage declaration (0 real USMCA drivers have a document) — declare the gap,
  don't invent data.

## OWNER FREEZE — active now
No production writes to money/accounting/load data by any seat, not even for proof or
correction. Measure and report instead.

## LEAD RETRACTION (affects mileage-engine framing, FYI — not your lane)
Settlements already compute miles from `mdata.loads` (Engine A, alive, MPG=7.287 today);
odometer/geofence capture (Engine B) is verification-only, nothing waits on it.

## STANDING
USMCA only. Reads: `SET LOCAL ROLE neondb_owner; SET LOCAL app.bypass_rls = 'lucia'`. No
test/sample/demo row in USMCA, ever. No `--no-verify`. NOTHING STAYS LOCAL — push same-day.
