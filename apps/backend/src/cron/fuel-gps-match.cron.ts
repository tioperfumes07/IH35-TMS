import type { FastifyInstance } from "fastify";

let initialized = false;

/**
 * ROUND 306 E-22: the fuel<->GPS match no longer runs hourly over every company. It runs when fuel
 * rows arrive — fuel/fuel-ingest-hooks.ts onFuelIngestComplete — which is the only time there is
 * anything new to match. FUEL_GPS_MATCH_CRON_ENABLED=false still switches it off there.
 */
export function initializeFuelGpsMatchCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  app.log.info("Fuel GPS match runs on fuel-ingest completion (fuel/fuel-ingest-hooks.ts), not hourly");
}
