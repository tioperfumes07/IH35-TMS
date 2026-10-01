# LEAD RULING 2026-10-01 — EACH SEAT BUILDS ITS ENGINE END TO END. NO HANDOFFS.

OWNER, verbatim, 2026-10-01: "coders are handing off to other coders, i explicitly told you to have
them fully build their own engines, not handoff, and it is the first thing they are doing."

The Lead's own ORDERS files routed work between seats (CC-2's complaints migration to CC-1,
Cursor's missing fields to CC-1/CC-3, CC-3's E-23 onto CC-2's derived time). That was the Lead
creating the handoffs the owner forbade. Corrected here; this ruling supersedes every routing line
in ORDERS-2026-10-01-*.md and NOW-*.md.

## THE RULE
1. The seat that owns an engine in docs/engines/IH35-ENGINE-REGISTRY-2026-10-01.xlsx (sheet 2)
   builds EVERYTHING that engine needs: the migration, the backend service and route, the cron,
   the screen, the guard, the tests, the linkage. A missing piece is yours to build, not to post.
2. OUTBOX is for reporting what you built and what the owner must decide. It is not a request
   queue to another seat. A line that reads "needs CC-x to..." is a handoff and is refused.
3. The only things a seat may wait on: an owner decision (AUTH / flag), and a table the Lead has
   announced is landing (E-03 unit_stop_events) — and even then you feature-detect and keep going.
4. Shared primitives stay shared, never re-implemented: driverAtTimeSql, the geofence detector,
   canonical-active-load-set, bindLoadToGeofences, stampDocumentVoided. Call them; do not copy.

## WHAT CHANGES IN THE GATE (same PR as this ruling)
- verify-migration-lane-band: every building seat gets its own migration band —
  cc-1/claude HH 00–05 · cc-2 HH 06–08 · cc-3 HH 09–11 · cursor HH 12–23. Chrome-only stays for
  codex/cascade/devin/audit only. CLAIMED-MIGRATION-NUMBERS.json remains mandatory first.
- verify-lane-ownership: this ruling is a standing LANE_CROSS for any seat touching any directory
  for its OWN registered engine. Run the gate with
  `LANE_CROSS=2026-10-01-LEAD-RULING-EACH-SEAT-BUILDS-ITS-ENGINE-END-TO-END.md` and name the
  engine id in the FINDING line. Touching another seat's engine is still a cross and still needs
  that seat's OUTBOX note plus a Lead ruling.

## WHAT THIS MEANS TODAY
- CC-2: the complaints migration (load_id, unit_id, categories) is YOURS. Claim HH 06–08. CC-1's
  row 5 is withdrawn.
- Cursor: a missing backend field for your module is YOURS — the route, the read model, the
  migration if one is needed (HH 12–23). CC-1's row 9 and CC-3's row 4 (driver-profile endpoints)
  stand only for what is already merged; from here Cursor builds what its screens need.
- CC-3: E-23 reads the pump time it needs; if CC-2's derived column is not there when you get to
  it, derive it inside E-23 from the same stop dwell (call the shared stop capture, do not copy).
- CC-1: Maintenance / Customers / Vendors backend is yours ONLY where it is your engine (E-14,
  E-15, E-16, E-17). Everything a module screen needs beyond that, Cursor builds.
