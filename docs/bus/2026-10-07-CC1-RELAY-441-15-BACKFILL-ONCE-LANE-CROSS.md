# LANE_CROSS — CC-1 — ROUND 441.15 one-shot server-side Relay backfill (2026-10-07)

**Authority:** Lead order to CC-1, 2026-10-07, ROUND 441.9 item 7 and 441.15 item 2: "RUN THE RELAY BACKFILL YOURSELF —
weeks 34, 38 and 09-27 to today … Do NOT hand it back to him."

File outside any seat's lane (UNASSIGNED): `apps/backend/src/integrations/relay-payments/relay-fuel-ingest.cron.ts`.
At boot, RELAY_FUEL_BACKFILL_ONCE="<run_id>|<COMPANY>|<months>" runs the SAME runRelayFuelBackfill the Owner-only route
runs, exactly once per run_id (advisory lock plus a started event in the audit trail). The Relay key never leaves the server.
No change to the daily tick, the pull or the upsert.

No seat has anything to do.
