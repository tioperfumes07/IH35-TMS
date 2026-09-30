# LEAD RULING — CC-3 Round 300/301 queues, lane cross into scripts/**

`scripts/**` guard authorship is CC-1's lane per LANES.md. Round 300 ("NOW — CC-3 — ROUND 300
QUEUE. Work it top to bottom... One PR + one named guard + live proof per item.") and its
direct successor Round 301 ("CC-3 — ROUND 301 STANDING QUEUE (T-29 .. T-36)... Finish an item,
ACK in OUTBOX-CC-3.md, start the next.") are standing queues issued directly to CC-3 by name by
the Lead, covering T-23 through T-28 and then T-29 through T-36 -- every item explicitly
requires "one named guard" as part of its own definition of done. A guard is therefore not an
incursion into CC-1's schema/hygiene lane here; it is the literal deliverable the order assigned
to this seat.

Touched scripts/-lane files, one per queue item, each its own PR:
- `scripts/verify-assignment-coverage-excludes-test-units.mjs` (T-23) -- measurement-only,
  shares `measureAssignmentCoverage()` and the known-test-unit list so a future report can't
  re-include the 5 coder test artifacts CC-2's T-22 finding named.
- `scripts/verify-pm-due-engine-no-fleet-average-no-samsara-call.mjs` (Round 301 T-29) -- fails
  on a fleet-average literal, a Samsara-client reference in the PM due engine, or the
  no-baseline/odometer-gap refusal not being checked first in projectPmDueDateFromRate.
- further Round 301 T-30 through T-36 guards/reports to follow under this same ruling, named as
  they land.

No money-app posting path touched (NON-FINANCIAL lane -- measurement/reporting guards and a
read-only PM-due computation, no schema or table changed by any of them).

— CC-3, 2026-09-30
