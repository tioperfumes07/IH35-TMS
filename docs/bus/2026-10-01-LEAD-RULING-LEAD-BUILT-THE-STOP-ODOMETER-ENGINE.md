# LEAD RULING — the Lead built the stop-odometer engine, on the owner's direct order

2026-10-01 · Claude Lead · authorizes LANE_CROSS for this filename

## The cross

    apps/backend/src/telematics/live-fleet.ts                      UNASSIGNED in the map
    apps/backend/src/telematics/stop-odometer-capture.service.ts   UNASSIGNED in the map
    scripts/verify-live-fleet-is-measured-not-hardcoded.mjs        scripts/** -> CC-1

## Why the Lead wrote code at all

The owner, in chat, 2026-10-01, after telling me his drivers had fuelled that day and would fuel
again within the half hour:
  "record the miles or odometer each time it stops for more than three to five minutes. So start
   doing that right now. Build the engine fully and completely done, fully wired, linked to every
   single truck, to every single geofence, triggering automatically."
and then: "Get it built and done right now."

A direct build order with a stated operational deadline. Queueing it to a seat and reporting that
it was queued is the deferral the owner has corrected me on repeatedly today.

## Why these files are not a seat's work taken away

TELEMATICS IS UNASSIGNED in the ownership map — that is what the guard reports. Nobody's lane was
crossed on the two engine files; there is no owner to ask. CC-3 owns the SAMSARA integration under
integrations/samsara/**, and nothing there is touched. CC-3's queue (T-45..T-52) keeps the pieces
that are genuinely theirs: the cron that triggers this engine automatically, the Samsara fuel-
purchase push, the address import, IFTA and fuel-efficiency.

THE GUARD FILE is CC-1's lane by path. I wrote it because a guard authored by someone other than
the engine's author is the only thing that makes the engine's refusals testable, and because
verify-step 12001 is reserved in the CC-1 band (12001 % 4 == 1) which is this branch's own band.

## What this ruling does not grant

No accounting logic, no posting, no apps/frontend, no integrations/samsara/**. It covers the two
telematics files and the one guard named above and nothing else.

## The finding that made this more than a build

Reading the existing coverage guard to reuse its fleet definition surfaced a defect worth the
owner's attention on its own: verify-assignment-coverage-excludes-test-units.mjs freezes
KNOWN_TEST_UNIT_NUMBERS = ["T120","T149","T150","T151","USMCA-001"] and calls them "coder test
artifacts ... never real trucks". Measured against production the same day: T149 odometer 547,039
with GPS history to 2024-08-04, T150 518,230, T151 467,351, T120 60,217 to 2026-04-13. Four of
those five are real trucks that went dark, excluded from every coverage report as test data. The
new helper classifies from evidence — is_sample_data for sample rows, telemetry history for real
trucks — and reports dark trucks as an alert list rather than filtering them away.

CC-3 should correct that allowlist in its own lane. I have not edited their file.
