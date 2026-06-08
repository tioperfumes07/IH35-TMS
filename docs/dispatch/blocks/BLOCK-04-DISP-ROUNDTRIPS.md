AGENT-1 · Block 4 of 13 — PHASE Dispatch / TASK <add tracker row DISP-ROUNDTRIPS> — Round Trips view + OOS bottom of every view
SO: prepend BOX 0. ADDITIVE rename only (Units→Round Trips) — keep route/key, relabel.
SCOPE: Round Trips = Kanban-style; each unit card + its return-trip card beside it (RETURN·SB tag) or dashed "Needs return" + "+ Book return". Bands implicit by pairing, not status headers. Add a shared oosStrip() that pins in-shop/OOS units (with reason + ETA back) to the BOTTOM of EVERY dispatch view.
FILES: apps/frontend/src/pages/dispatch/RoundTrips.tsx (NEW), shared FleetOosStrip.tsx (NEW) imported by all views; relabel "Units"→"Round Trips" in dispatch view registry.
ACCEPTANCE: pairs render; needs-return flagged; OOS strip at bottom of every view; clicks open drawers.
LANE LOCK: new files; view-registry single writer.
