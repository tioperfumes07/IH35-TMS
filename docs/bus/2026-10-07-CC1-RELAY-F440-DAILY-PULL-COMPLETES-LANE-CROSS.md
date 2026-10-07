# LANE_CROSS — CC-1 — RELAY-F440 the daily Relay fuel pull records its finish (2026-10-07)

**Authority:** Lead order to CC-1, 2026-10-07, "CC-1 · RELAY-F440 · THE DAILY FUEL PULL HAS NEVER COMPLETED ONCE · P0"
(full order ~/Downloads/10-07-2026-CC-1-RELAY-F440-FEED-DEAD-FIX-NOW.md), which names this file and the required changes.

File outside any seat's lane in `docs/bus/LANES.md` (UNASSIGNED):
- `apps/backend/src/integrations/relay-payments/relay-fuel-ingest.cron.ts`:
  - the claim is closed in `finally`, and a 0-row finish is refused;
  - a crashed claim is reclaimable;
  - the watermark falls back to max(relay_created_at);
  - the window is read inside the try.
  No change to the pull, the upsert, the GL flush or the backfill.

No seat has anything to do. SettlementCreatorDrawer.tsx and settlement-creator-seed-loads.ts are not touched.
