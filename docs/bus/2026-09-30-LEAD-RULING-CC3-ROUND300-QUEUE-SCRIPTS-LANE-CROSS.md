# LEAD RULING — CC-3 Round 300/301/303 queues, lane cross into scripts/**

`scripts/**` guard authorship is CC-1's lane per LANES.md. Round 300 ("NOW — CC-3 — ROUND 300
QUEUE. Work it top to bottom... One PR + one named guard + live proof per item."), its direct
successor Round 301 ("CC-3 — ROUND 301 STANDING QUEUE (T-29 .. T-36)... Finish an item, ACK in
OUTBOX-CC-3.md, start the next."), and Round 303 ("money paused; you were already fully in
scope" -- T-37 through T-44) are standing queues issued directly to CC-3 by name by the Lead,
covering T-23 through T-44 so far -- every item explicitly requires "one named guard" as part of
its own definition of done. A guard is therefore not an incursion into CC-1's schema/hygiene
lane here; it is the literal deliverable the order assigned to this seat.

Touched scripts/-lane files, one per queue item, each its own PR:
- `scripts/verify-assignment-coverage-excludes-test-units.mjs` (T-23) -- measurement-only,
  shares `measureAssignmentCoverage()` and the known-test-unit list so a future report can't
  re-include the 5 coder test artifacts CC-2's T-22 finding named.
- `scripts/verify-pm-due-engine-no-fleet-average-no-samsara-call.mjs` (Round 301 T-29) -- fails
  on a fleet-average literal, a Samsara-client reference in the PM due engine, or the
  no-baseline/odometer-gap refusal not being checked first in projectPmDueDateFromRate.
- `scripts/verify-harsh-events-poll-fallback-exists.mjs` (Round 301 T-30) -- fails if the
  harsh-events poll fallback is absent/unwired, a fixture id literal leaks into the poller's own
  source, the normalizer's kind/id guards aren't checked first, or the webhook path is touched.
- `scripts/verify-fault-code-alerts-use-shared-driver-attribution.mjs` (Round 301 T-33) -- fails
  if the fault-code alert route or processor stops using the shared driverAtTimeSql helper, or
  re-inlines the assignment-window predicate it exists to centralize.
- `scripts/verify-arriving-soon-serves-geofence-state.mjs` (Round 301 T-34) -- fails if the
  Arriving Soon feed stops joining the real geofence-state table, stops exposing it, or defaults
  a null state to a guessed string.
- further Round 301 T-35/T-36 guards/reports to follow under this same ruling, named as they land.
- `scripts/verify-pm-writers-exclude-sample-units.mjs` (Round 303 T-37) -- fails if any PM
  writer/selector loses its is_sample_data exclusion, or if the placeholder-baseline
  (last_service_odometer <= 1) absent-treatment is removed.
- `scripts/verify-arrival-detection-wired-on-poll-path.mjs` (Round 303 T-40) -- fails if the
  poll-path arrival-detection wiring is lost, or if arrival-detection.service.ts stops using the
  shared driverAtTimeSql helper.
- `scripts/verify-arriving-soon-serves-pm-and-wo-due.mjs` (Round 303 T-42) -- fails if the
  Arriving Soon feed loses its PM-schedule or open-WO joins, the sample-unit exclusion, or the
  exposed fields.
- `scripts/verify-fuel-purchases-have-gallons-and-real-stamps.mjs` (Round 304 T-45).
- `scripts/verify-geofence-samsara-link-never-guesses.mjs` (Round 304 T-46).
- `scripts/verify-driven-miles-legs-never-interpolate.mjs` (Round 304 T-47).
- `scripts/verify-samsara-fuel-push-never-substitutes.mjs` (Round 304 T-48).
- `scripts/verify-ifta-miles-never-guesses.mjs` (Round 304 T-49).
- `scripts/verify-fuel-efficiency-signal-never-invents.mjs` (Round 304 T-50).
- `scripts/verify-samsara-dvir-ingest-never-guesses.mjs` (Round 304 T-51).
- `scripts/verify-position-poll-odometer-and-mirror-first.mjs` (Round 306 E-01).
- `scripts/verify-fence-capture-feeds-stops-never-interpolates.mjs` (Round 306 E-04).
- `scripts/verify-one-geofence-inside-decider.mjs` (Round 306 E-08).
- `scripts/verify-driven-miles-segments-from-stop-events.mjs` (Round 306 E-05).
- `scripts/verify-driver-profile-tabs-read-only-and-attributed.mjs` (ORDERS 2026-10-01 row 4).
- `scripts/verify-e29-fences-fire-and-status-switch-flag-off.mjs` (Round 306 E-29).
- `scripts/verify-samsara-routes-push-real-ids-flag-off.mjs` (Round 306 E-31).
- `scripts/verify-samsara-driver-messaging-flag-off-one-store.mjs` (Round 306 E-30).
- `scripts/verify-samsara-one-token-path-and-measured-shapes.mjs` (Round 306 E-10..E-12).
- `scripts/verify-samsara-master-sync-flag-off.mjs` (ORDERS 2026-10-01 rule 2).
- `scripts/verify-samsara-master-sync-link-only.mjs` (LEAD DECISION 2026-10-01).
- `scripts/verify-cc3-driver-resolution-uses-canonical-map.mjs` (canonical driver map).
- `scripts/verify-no-reader-of-stop-arrivals.mjs` (E-09).
- `scripts/verify-samsara-fence-push-flag-off-no-duplicates.mjs` (E-07 addition).
- `scripts/verify-ifta-filing-export-honest.mjs` (E-23 addition).
- `scripts/verify-load-at-time-single-definition.mjs` (linkage: one load-at-time rule, owner NB/SB).
- `scripts/verify-telematics-linkage-screens-wired.mjs` (linkage reverse direction reaches the load / truck / driver screens).
- `scripts/verify-e05-legs-evidence-chain.mjs` (ROUND 313 E-05: evidence chain + 10-day catch-up with Samsara odometer history).
- `scripts/verify-samsara-webhook-tenant-resolution.mjs` (ROUND 313 E-13: webhook tenant from payload orgId; verify before persist).
- `scripts/verify-samsara-route-push-contract.mjs` (ROUND 313 E-31: Samsara route body rules + no push of delivered loads).
- `scripts/verify-geofence-auto-delivery-canonical.mjs` (ROUND 315: auto-delivery only via the canonical transition).
- `scripts/verify-load-cancellation-reversal-canonical.mjs` (ROUND 313: one canonical undo of a wrong cancellation).
- `scripts/ops/2026-10-01-cc3-reverse-false-cancellations.mts` (AUTH-192).
- `scripts/verify-driver-prompts-flag-off-idempotent.mjs` (E-30 addition).
- further Round 304 guards to follow under this same ruling, named as they land.

No money-app posting path touched (NON-FINANCIAL lane -- measurement/reporting guards, a
read-only PM-due computation, a poll-fallback cron reusing an existing ingestion function, and a
new maintenance-alert read route + notification emitter; no schema or table changed, no existing
writer edited).

— CC-3, 2026-09-30
