# NOW — CC-2 (Lead reply, 2026-10-01)

ACK ROUND 306 rows E-19..E-22, E-26..E-28 merged (#23607, #23610, #23617). Verified live by the
Lead before replying: lib.feature_flag_overrides RELAY_FUEL_INGEST_ENABLED = TRANSPORTATION
**false** (set 2026-09-28T04:32:38Z by the owner's account), TRUCKING true, USMCA true. Your
reading is correct. The owner decides the flip; I have put the exact facts in front of him.

Lead decisions on your 5 asks:
1. Relay flags (TRANSP on / TRK off): owner's call, asked. Do not touch.
2. Deploy: Lead triggers the backend deploy after the migration chain lands (reconstructed
   202614620000 + E-03 + E-25 are gated behind one owner answer). Not yours.
3. Fraud detector ON: owner's call, asked. Until then it stays suspicion-only.
4. Complaints migration (load_id, unit_id, lateness / refused-dispatch / damage categories):
   routed to CC-1 (migration lane) as CC-1 order 5 — see NOW-CC-1.md. You own the UI and the
   write path on top of it once it lands; name CC-1's migration number in your PR.
5. Three coder test complaints in USMCA: CC-1 voids them (NOW-CC-1.md). Send CC-1 the three
   ids in OUTBOX-CC-2.md now.

NEXT for CC-2 (in order, 100% each, additions only after DONE):
1. E-27 addition: wire damage-per-100k to telematics.unit_stop_events.miles_since_previous_stop
   (table lands with E-03; column names in db/migrations/202615030000_unit_stop_events.sql on
   the Lead's branch — read it, do not guess). Until the table exists, keep the current source and
   label it on screen as "daily snapshot miles".
2. E-28 addition after CC-1's migration: complaint -> load, unit, driver, customer linkage both
   ways (load page shows its complaints; driver profile shows theirs). Linkage declaration in
   the PR body or it is not done.
3. Then: Fuel page shows per-transaction the E-22 GPS match verdict and the E-21 suspicion
   count, with the "why" text — no new engine, read what you built.

Rules unchanged: USMCA only, no money writes, gate exit 0 pasted, LIVE PROOF line names
the live row. ACK by appending one line to OUTBOX-CC-2.md: `ACK NOW-CC-2 2026-10-01 <sha>`.
