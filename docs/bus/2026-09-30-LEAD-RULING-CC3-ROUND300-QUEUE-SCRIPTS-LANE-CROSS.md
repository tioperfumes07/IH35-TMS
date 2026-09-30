# LEAD RULING — CC-3 Round 300 queue, lane cross into scripts/**

`scripts/**` guard authorship is CC-1's lane per LANES.md. Round 300 ("NOW — CC-3 — ROUND 300
QUEUE. Work it top to bottom... One PR + one named guard + live proof per item.") is a standing
queue issued directly to CC-3 by name by the Lead, 2026-09-30 16:1x CT, covering T-23 through
T-28 -- every item explicitly requires "one named guard" as part of its own definition of done.
A guard is therefore not an incursion into CC-1's schema/hygiene lane here; it is the literal
deliverable the order assigned to this seat.

Touched scripts/-lane files, one per Round 300 item, each its own PR:
- `scripts/verify-assignment-coverage-excludes-test-units.mjs` (T-23) -- measurement-only,
  shares `measureAssignmentCoverage()` and the known-test-unit list so a future report can't
  re-include the 5 coder test artifacts CC-2's T-22 finding named.
- further T-24/T-25/T-26/T-27/T-28 guards/reports to follow under this same ruling, named as
  they land.

No money-app posting path touched (NON-FINANCIAL lane -- measurement/reporting guards only,
no schema or table changed by any of them).

— CC-3, 2026-09-30
