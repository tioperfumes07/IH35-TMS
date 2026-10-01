#!/usr/bin/env node
// E-21 addition: Samsara's Fuel & Energy DRIVER report is signal 4 of fuel integrity — ECU gallons
// burned while the driver was logged in vs truck fuel bought for that driver (card gallons less reefer).
//
// --selftest: decideSamsaraFuelSignal every branch; the Samsara signal with an MPG signal is never a
//   finding (shared fuel_card_gallons); with relay_fill_presence it is; the tank slack is the fraud
//   detector's own tank model (no invented tolerance); every caller passes the shared fetcher.
// live (read-only, USMCA): signal 4 is present on every row; "unavailable" always names why; a
//   non-unavailable verdict always carries the burn and the bought gallons it compared.
import pg from "pg";
import { readFileSync } from "node:fs";
import { register as registerTsx } from "tsx/esm/api";

registerTsx();

const LABEL = "verify-fuel-integrity-samsara-signal";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ROOT = new URL("../../", import.meta.url);
const SVC = "apps/backend/src/maintenance/fuel-integrity.service.ts";

async function selftest() {
  const assert = (await import("node:assert/strict")).default;
  const { decideSamsaraFuelSignal, decideFuelIntegrity, SAMSARA_TANK_SLACK_GAL } = await import(new URL(SVC, ROOT));
  const { DEFAULT_TANK_CAPACITY_GAL, TANK_OVERFLOW_TOLERANCE } = await import(new URL("apps/backend/src/integrations/fuel/fraud-detector/rules.service.ts", ROOT));
  assert.equal(SAMSARA_TANK_SLACK_GAL, DEFAULT_TANK_CAPACITY_GAL * TANK_OVERFLOW_TOLERANCE, "tank slack must be the fraud detector's tank model");
  const burn = (g) => ({ burnedGallons: g, samsaraDriverIds: ["s1"], samsaraMiles: 1000 });
  assert.equal(decideSamsaraFuelSignal({ feedError: "samsara_not_configured", burn: burn(100), truckGallons: 500, trucksDriven: 1 }).verdict, "unavailable", "unreadable feed is unavailable, never zero");
  assert.match(decideSamsaraFuelSignal({ feedError: "x", burn: null, truckGallons: 1, trucksDriven: 1 }).reason, /could not be read \(x\)/);
  assert.equal(decideSamsaraFuelSignal({ feedError: null, burn: null, truckGallons: 500, trucksDriven: 1 }).verdict, "unavailable", "unmapped driver");
  assert.equal(decideSamsaraFuelSignal({ feedError: null, burn: burn(0), truckGallons: 500, trucksDriven: 1 }).verdict, "unavailable", "no burn reported");
  assert.equal(decideSamsaraFuelSignal({ feedError: null, burn: burn(100), truckGallons: null, trucksDriven: 1 }).verdict, "unavailable", "nothing bought");
  assert.equal(decideSamsaraFuelSignal({ feedError: null, burn: burn(400), truckGallons: 400 + SAMSARA_TANK_SLACK_GAL, trucksDriven: 1 }).verdict, "normal", "exactly one tank of slack is not anomalous");
  assert.equal(decideSamsaraFuelSignal({ feedError: null, burn: burn(400), truckGallons: 400 + SAMSARA_TANK_SLACK_GAL + 1, trucksDriven: 1 }).verdict, "anomalous");
  assert.equal(decideSamsaraFuelSignal({ feedError: null, burn: burn(400), truckGallons: 400 + SAMSARA_TANK_SLACK_GAL + 1, trucksDriven: 2 }).verdict, "normal", "two trucks = two tanks of slack");
  const s4 = decideSamsaraFuelSignal({ feedError: null, burn: burn(100), truckGallons: 400, trucksDriven: 1 });
  assert.ok(s4.sources.includes("fuel_card_gallons") && s4.sources.includes("samsara_ecu_fuel_burn"));
  const mpg = { signal: "mpg_odometer_snapshot", sources: ["fuel_card_gallons", "odometer_daily_snapshot"], verdict: "anomalous", arithmetic: "x", reason: "x", evidence: [] };
  const presence = { signal: "relay_fill_presence", sources: ["relay_pump_location", "unit_gps_positions"], verdict: "anomalous", arithmetic: "x", reason: "x", evidence: [] };
  assert.equal(s4.verdict, "anomalous");
  assert.equal(decideFuelIntegrity([mpg, s4]).status, "suspicion", "Samsara + MPG share card gallons — never a finding");
  assert.equal(decideFuelIntegrity([presence, s4]).status, "finding", "Samsara + pump presence are independent");
  const src = readFileSync(new URL(SVC, ROOT), "utf8");
  assert.ok(!/does not exist yet/.test(src), "the T-50 feed exists; signal 4 must not be hardcoded unavailable");
  const routes = readFileSync(new URL("apps/backend/src/maintenance/integrity.routes.ts", ROOT), "utf8");
  assert.equal((routes.match(/samsaraDriverReport: \(\) => samsaraFuelEnergyFetcher\(/g) ?? []).length, 3, "fuel-integrity + both driver-profile routes must pass the shared Samsara fetcher");
  const t50 = readFileSync(new URL("apps/backend/src/telematics/fuel-efficiency-signal.routes.ts", ROOT), "utf8");
  assert.ok(/samsaraFuelEnergyFetcher\(/.test(t50) && !/new SamsaraClient/.test(t50), "T-50 route must use the same fetcher");
  console.log(`${LABEL} --selftest PASS (16/16)`);
}

if (process.argv.includes("--selftest")) {
  await selftest();
  process.exit(0);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(`${LABEL}: FAIL — DATABASE_URL not set and this guard does not declare ALLOW_OFFLINE_SKIP.`);
  process.exit(1);
}
const client = new pg.Client({ connectionString: url });
await client.connect();
// CI's verify:pre-commit runs verify-steps against a fresh, empty database: without the USMCA row
// there is nothing production-shaped to measure, so only the offline proof runs, and it says so.
const probe = await client.query("SELECT 1 FROM org.companies WHERE id = $1::uuid", [USMCA]);
if (probe.rows.length === 0) {
  await client.end();
  await selftest();
  console.log(`DATABASE PHASE: USMCA company absent (fresh CI DB) — selftest only, NOT live proof`);
  process.exit(0);
}
await selftest();
const { computeDriverFuelIntegrity } = await import(new URL(SVC, ROOT));
const { samsaraFuelEnergyFetcher } = await import(new URL("apps/backend/src/telematics/samsara-fuel-energy-fetcher.ts", ROOT));
let r;
try {
  await client.query("BEGIN");
  await client.query("SET LOCAL ROLE neondb_owner");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  await client.query("SET LOCAL default_transaction_read_only = on");
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 86_400_000);
  r = await computeDriverFuelIntegrity(client, USMCA, start.toISOString(), end.toISOString(), {
    samsaraDriverReport: () => samsaraFuelEnergyFetcher(client, USMCA, start.toISOString(), end.toISOString())("drivers"),
  });
  await client.query("ROLLBACK");
} finally {
  await client.end();
}
const problems = [];
const verdicts = {};
for (const row of r.rows) {
  const s = row.signals.find((x) => x.signal === "samsara_fuel_energy");
  if (!s) { problems.push(`${row.driver_id}: no samsara_fuel_energy signal`); continue; }
  verdicts[s.verdict] = (verdicts[s.verdict] ?? 0) + 1;
  if (!s.reason) problems.push(`${row.driver_id}: signal 4 without a reason`);
  if (s.verdict !== "unavailable" && !(s.evidence[0]?.burned_gallons > 0 && s.evidence[0]?.truck_gallons > 0)) problems.push(`${row.driver_id}: verdict ${s.verdict} without the burn and bought gallons it compared`);
}
if (problems.length) {
  console.error(`${LABEL}: FAIL — ${problems.slice(0, 10).join("; ")}`);
  process.exit(1);
}
console.log(`${LABEL}: LIVE PASS — read-only, ${r.rows.length} drivers, signal 4 ${JSON.stringify(verdicts)}; feed ${r.coverage.samsara_feed_error === null ? "read" : `unreadable here (${r.coverage.samsara_feed_error}) — reported, never faked`}; ${r.coverage.samsara_drivers_with_burn} drivers with burn, ${r.coverage.samsara_drivers_unmapped} Samsara drivers unmapped.`);
