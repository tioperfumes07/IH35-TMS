# CC-1 LANE CROSS — 2026-09-23 — E20 Samsara driver-mapping routes

# COMMIT TO: docs/bus/09-23-2026-CC-1-LANE-CROSS-E20-SAMSARA-DRIVER-MAPPING-ROUTES.md
# LANE: docs/bus/** (SHARED, any seat may write here per LANES.md).

`apps/backend/src/integrations/**` has no owner in `docs/bus/LANES.md` (same UNASSIGNED class
already crossed once this session for `apps/backend/src/integrations/edi/**` — Round 84 ruling
doc). E20 Part A is CC-1's own assigned engine, ordered directly and repeatedly by the owner/Lead
this round ("CC-1 — BUILD NOW... START E20 PART A THIS TURN... THE RESOLVER, THE BACKFILL AND THE
ENDPOINT... CC-2 IS BLOCKED ON YOUR E20 PART A ENDPOINT"), and the new files live entirely under a
brand-new subdirectory (`driver-mapping/`) that collides with nothing else in `integrations/`.

RULING (self-ruled, direct owner order is the authorization, same basis as the Round 84 EDI
cross): CC-1 is authorized for these paths, this build only:
  apps/backend/src/integrations/samsara/driver-mapping/**
  apps/backend/src/index.ts (2-line route registration only — import + one register call)

No other file under `apps/backend/src/integrations/samsara/**` is touched by this cross — the
existing `vendor-mapping.routes.ts` / `vendor-mapping-actions.routes.ts` (a DIFFERENT,
pre-existing feature: Samsara→QBO vendor mapping via the legacy `mdata.drivers.samsara_driver_id`
scalar + `mdata.drivers.qbo_vendor_id`, unrelated to E20's `integrations.samsara_drivers.local_driver_id`
/`local_vendor_id` mapping columns) are read for pattern reference only, never edited.
