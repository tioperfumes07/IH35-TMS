#!/usr/bin/env node
/**
 * ROUND 313 E-05: driven-miles legs went silent after 2026-09-29 because (a) a leg was classified only from TMS
 * hand stamps most loads never get, (b) delivered loads fell out of the status filter, (c) stops older than the
 * E-01 gps-odometer era had no odometer. This guard keeps each fix in place:
 *   - pickup departure / delivery arrival = TMS stamp, else the stop's Samsara fence (shared stopFenceTimeSql),
 *     else the unit's own E-03 dwell within 500 m of the stop;
 *   - loads due to deliver in the last 7 days stay in scope;
 *   - in-transit legs after pickup count as loaded;
 *   - the stop writer runs a daily 10-day catch-up fed by Samsara odometer history (stats/history).
 */
import { readFileSync } from "node:fs";
import { runGuard, runGuardInFixture, statusOf, outputOf, reportSelftest } from "./lib/guard-selftest.mjs";
import { fileURLToPath } from "node:url";


if (process.argv.includes("--selftest")) selftest();

const f = (p) => readFileSync(p, "utf8");
const svc = f("apps/backend/src/integrations/samsara/geofences/real-driven-miles.service.ts");
const writer = f("apps/backend/src/telematics/unit-stop-events.writer.ts");
const cron = f("apps/backend/src/cron/unit-stop-events.cron.ts");
const client = f("apps/backend/src/integrations/samsara/samsara-client.ts");
const checks = [
  [/stopFenceTimeSql\("l\.id", "p\.sequence_number", "l\.assigned_unit_id", "exited"\)/.test(svc), "pickup departure falls back to the stop fence exit"],
  [/stopFenceTimeSql\("l\.id", "d\.sequence_number", "l\.assigned_unit_id", "entered"\)/.test(svc), "delivery arrival falls back to the stop fence entry"],
  [/STOP_DWELL_SQL\("p"/.test(svc) && /STOP_DWELL_SQL\("d"/.test(svc), "both ends fall back to the unit's own dwell at the stop"],
  [/now\(\) - interval '7 days'/.test(svc), "loads delivered in the last 7 days stay in scope"],
  [/o\.delivery_arrived_at IS NULL OR o\.to_started_at <= o\.delivery_arrived_at/.test(svc), "in-transit legs after pickup are loaded"],
  [/DISTINCT ON \(load_id, unit_id, segment_kind, from_ended_at\)/.test(svc), "one leg per start (no ON CONFLICT double-hit)"],
  [/export async function writeUnitStopEventsCatchUp/.test(writer) && /odometer_readings/.test(writer), "writer catch-up + local odometer readings"],
  [/writeUnitStopEventsCatchUp\(client, USMCA_COMPANY_ID, 10/.test(cron) && /listOdometerHistory/.test(cron), "daily catch-up cron fed by Samsara odometer history"],
  [/async listOdometerHistory\(/.test(client) && /stats\/history/.test(client), "SamsaraClient.listOdometerHistory"],
];
const fails = checks.filter(([ok]) => !ok).map(([, what]) => what);
if (fails.length) { console.error("verify-e05-legs-evidence-chain: FAIL\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`verify-e05-legs-evidence-chain: OK (${checks.length} checks)`);

// --selftest (Devin build order 2026-10-05): one case that MUST pass (the real tree) and one
// that MUST fail (a throwaway tree missing this guard's inputs — proves it fails closed,
// never a vacuous green).
function selftest() {
  const me = fileURLToPath(import.meta.url);
  const real = runGuard(me);
  const missing = runGuardInFixture(me, {});
  reportSelftest("verify-e05-legs-evidence-chain", [
    { name: "real repo tree passes", pass: statusOf(real) === 0, detail: statusOf(real) === 0 ? undefined : outputOf(real).slice(-400) },
    { name: "guard fails closed when its inputs are absent", pass: statusOf(missing) !== 0 },
  ]);
}
