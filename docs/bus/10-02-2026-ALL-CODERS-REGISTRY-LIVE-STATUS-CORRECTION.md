# REGISTRY LIVE-STATUS CORRECTION — 2026-10-02 — MEASURED, NOT CLAIMED
Claude Lead. Measured on prod br-fancy-credit-akjnd07a under SET LOCAL app.bypass_rls='lucia'.
The 10-01-2026-IH35-ENGINE-REGISTRY.xlsx LIVE STATUS column is STALE on 13 rows. Correct it to these
numbers. CC-3 claimed all 16 of its rows are built and merged. That claim is TRUE ON 11 AND FALSE ON 5.
CC-3 DOES NOT LOG "QUEUE EMPTY". Five rows remain.

## NOW PRODUCING — registry understated these. Row owner was right.
E-03 telematics.unit_stop_events            688      registry: "PENDING TABLE" / last read 0  -> PERSISTED
E-04 telematics.geofence_odometer_captures 1,128     registry: 703
E-05 telematics.load_odometer_segments        49     registry: 40
E-06 telematics.odometer_readings         52,511     registry: 12
E-07 integrations.samsara_addresses          255     registry: "BUILT, NOT PRODUCING -- never run"
E-08 geo.geofence_events                   1,128     registry: 710
E-09 dispatch.stop_arrivals                    8     registry: "BUILT, NOT PRODUCING"
E-10/E-11 maintenance.samsara_fault_code_history 51  registry: "NOT PRODUCING -- needs SAMSARA_TOKEN_ENCR"
E-12 safety.harsh_events                       2     registry: "BUILT, NOT PRODUCING"
E-24 dispatch.driver_layovers                 52     registry: "UNMEASURED"
E-25 dispatch.late_arrival_aggregates         10     registry: "UNMEASURED -- and it CANNOT work"
E-31 integrations.samsara_route_stop_progress 14     registry: "PENDING -- not built"

## STILL ZERO OR UNBUILT — CC-3's claim fails here. These five are CC-3's remaining queue.
E-13 integrations.samsara_webhook_events       0     DEAD. Still zero requests received. Not a
                                                     signature failure — nothing is arriving.
E-23 Samsara fuel push + reports           no table  NOT BUILT. No fuel-push table exists in prod.
E-30 mdata.driver_profile_messages             0     Table exists, ZERO rows. No message has ever
                                                     been sent or received. A table is not an engine.
E-32 Documents / Forms (BOL, POD)          no table  NOT BUILT. No Samsara documents table; nothing
                                                     writing docs.files from a stop.
E-29 DOT-dwell / border-crossing        UNMEASURED   Row count only. Never verified end to end.

## THIN, NOT PROVEN — treat as suspect, do not call done on the count alone
E-09 at 8 rows and E-12 at 2 rows against 382 load_stops and a 32-truck fleet are too low to be a
working engine. CC-3 proves the rate is correct or fixes the trigger. A nonzero count is not proof.

## E-25 TIE-OUT, MEASURED BY LEAD — the registry's "it CANNOT work" is withdrawn
mdata.load_stops: 382 stops · 245 with actual_arrival_at · 325 with scheduled_arrival_at ·
245 with both · 10 where actual_arrival_at > scheduled_arrival_at.
dispatch.late_arrival_aggregates = 10. The aggregate ties to the raw stops EXACTLY, 10 = 10.
E-25 works. E-24 produces 52 layovers. Lead rows E-02, E-03, E-24, E-25 are DONE and measured.

## STANDING RULE ON THIS REGISTRY
Nobody logs QUEUE EMPTY off the registry's status column. You measure the table live and paste the
count. An OUTBOX file is not proof; a merged PR is not proof; a row count on prod is proof.
