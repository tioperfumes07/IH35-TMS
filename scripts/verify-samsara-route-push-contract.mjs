#!/usr/bin/env node
/**
 * ROUND 313 E-31: the routes push failed 64/64 with HTTP 400 until three Samsara rules (each probed live
 * 2026-10-01) were honoured. Fails if any regresses, if a delivered load can be pushed, or if Samsara's own
 * error text stops reaching the ledger.
 */
import { readFileSync } from "node:fs";

// --selftest (Devin build order 2026-10-05): one case that MUST pass (the real tree) and one that
// MUST fail (a bare fixture cwd — a guard that reports green with none of its inputs present is a
// vacuous proof). Never writes to tracked source.
if (process.argv.includes("--selftest")) { await selftest_verify_samsara_route_push_contract(); }
async function selftest_verify_samsara_route_push_contract() {
  const { runGuard, runGuardInFixture, reportSelftest, statusOf, outputOf } = await import("./lib/guard-selftest.mjs");
  const { fileURLToPath } = await import("node:url");
  const me = fileURLToPath(import.meta.url);
  const live = runGuard(me);
  const empty = runGuardInFixture(me);
  reportSelftest("verify_samsara_route_push_contract", [
    { name: "real tree green", pass: statusOf(live) === 0, detail: statusOf(live) === 0 ? undefined : outputOf(live).slice(-300) },
    { name: "bare fixture fails closed", pass: statusOf(empty) !== 0, detail: statusOf(empty) !== 0 ? undefined : outputOf(empty).slice(-200) },
  ]);
}
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
  [/SET samsara_route_id = x\.rid/.test(svc), "read-back stamps route ids from the push ledger first"],
  [/export async function readBackSamsaraRoutes\(/.test(svc) && /samsara_route_stop_progress/.test(svc), "route read-back writes per-stop progress"],
  [/readBackSamsaraRoutes\(/.test(readFileSync("apps/backend/src/integrations/samsara/routes-push.cron.ts", "utf8")), "read-back runs on the routes cron"],
  [/samsara_route_progress/.test(readFileSync("apps/backend/src/telematics/telematics-linkage.service.ts", "utf8")), "load/unit reverse links include route progress"],
];
const fails = checks.filter(([ok]) => !ok).map(([, w]) => w);
if (fails.length) { console.error("verify-samsara-route-push-contract: FAIL\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`verify-samsara-route-push-contract: OK (${checks.length})`);
