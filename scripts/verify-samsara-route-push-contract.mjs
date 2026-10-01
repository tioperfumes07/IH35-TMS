#!/usr/bin/env node
/**
 * ROUND 313 E-31: the routes push failed 64/64 with HTTP 400 until three Samsara rules (each probed live
 * 2026-10-01) were honoured. Fails if any regresses, if a delivered load can be pushed, or if Samsara's own
 * error text stops reaching the ledger.
 */
import { readFileSync } from "node:fs";
const client = readFileSync("apps/backend/src/integrations/samsara/samsara-client.ts", "utf8");
const svc = readFileSync("apps/backend/src/integrations/samsara/routes-integration.service.ts", "utf8");
const up = client.slice(client.indexOf("async upsertRoute("), client.indexOf("async upsertRoute(") + 4000);
const checks = [
  [/!first && stop\.scheduledArrivalTime/.test(up), "first stop must not carry scheduledArrivalTime (departFirstStop)"],
  [!/driverId: input\.samsaraDriverId/.test(up), "route must not send driverId with vehicleId (vehicle OR driver)"],
  [/externalIds: \{ ih35Stop: String\(st\.stop_id\) \}/.test(svc), "stops carry ih35Stop only (no duplicate ih35Load value)"],
  [/actual_arrival_at IS NOT NULL[\s\S]{0,200}stopFenceTimeSql/.test(svc), "a delivered load is never pushed"],
  [/samsaraReason/.test(svc), "Samsara's error message is recorded in the ledger"],
  [/UPDATE mdata\.loads SET samsara_route_id = \$3/.test(svc), "a pushed route id is stamped on the load"],
  [/export async function readBackSamsaraRoutes\(/.test(svc) && /samsara_route_stop_progress/.test(svc), "route read-back writes per-stop progress"],
  [/readBackSamsaraRoutes\(/.test(readFileSync("apps/backend/src/integrations/samsara/routes-push.cron.ts", "utf8")), "read-back runs on the routes cron"],
  [/samsara_route_progress/.test(readFileSync("apps/backend/src/telematics/telematics-linkage.service.ts", "utf8")), "load/unit reverse links include route progress"],
];
const fails = checks.filter(([ok]) => !ok).map(([, w]) => w);
if (fails.length) { console.error("verify-samsara-route-push-contract: FAIL\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`verify-samsara-route-push-contract: OK (${checks.length})`);
