#!/usr/bin/env node
// ROUND 303 B-43 item 1, rewritten for ROUND 305 B-48: "B-29 HAS NEVER RUN ON REAL DATA ...
// Re-measure against the live fleet — read it from live-fleet.ts, do not hardcode 14 or 16, and
// note that 24 units are REAL TRUCKS GONE DARK, not test data."
//
// The first version of this guard hardcoded a 14-unit floor and repeated the "coder test artifacts"
// label for T120/T149/T150/T151. Both were wrong: the fleet is measured, and those four are real
// trucks (six-figure odometers, years of GPS) that went dark. This version hardcodes no fleet size.
//
// --selftest (no DB): a unit with telemetry history and no recent GPS classifies "dark", never
//   "sample"; a placeholder with no telemetry ever is "no_telemetry_ever", never "sample".
// live: runs computeDamageEventAttribution() and computeDriverDamageScorecard() on USMCA and FAILS
//   if (a) any event lacks a driver or a named gap reason, (b) any event on a unit with telemetry
//   history is classed "sample" without is_sample_data, or (c) the scorecard's drivers differ from
//   the drivers the event-level view attributes — the aggregate and the evidence must agree.
import pg from "pg";
import { register as registerTsx } from "tsx/esm/api";

registerTsx();

const LABEL = "verify-damage-scorecard-honest-zero";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const mod = (p) => import(new URL(`../../apps/backend/src/${p}`, import.meta.url));

async function selftest() {
  const assert = (await import("node:assert/strict")).default;
  const { classifyFleetUnit } = await mod("telematics/live-fleet.ts");
  const now = new Date("2026-10-01T00:00Z");
  const base = { unitId: "u", unitNumber: "T149", isSampleData: false };
  assert.equal(classifyFleetUnit({ ...base, lastGpsAt: new Date("2024-08-04T00:00Z"), everHadOdometer: true }, now).fleetClass, "dark", "a real truck gone dark is never test data");
  assert.equal(classifyFleetUnit({ ...base, lastGpsAt: null, everHadOdometer: false }, now).fleetClass, "no_telemetry_ever");
  assert.equal(classifyFleetUnit({ ...base, isSampleData: true, lastGpsAt: null, everHadOdometer: true }, now).fleetClass, "sample", "only is_sample_data makes a sample");
  assert.equal(classifyFleetUnit({ ...base, lastGpsAt: new Date("2026-09-30T20:00Z"), everHadOdometer: true }, now).fleetClass, "reporting");
  console.log(`${LABEL} --selftest PASS (4/4)`);
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

const { computeDamageEventAttribution } = await mod("maintenance/damage-event-attribution.service.ts");
const { computeDriverDamageScorecard } = await mod("maintenance/driver-damage-scorecard.service.ts");
const { classifyFleetUnit, fleetUnitFactsSql } = await mod("telematics/live-fleet.ts");

let coverage;
let scorecard;
let fleet;
try {
  await client.query("BEGIN");
  await client.query("SET LOCAL ROLE neondb_owner");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  const start = "2020-01-01T00:00:00Z";
  const end = new Date().toISOString();
  coverage = await computeDamageEventAttribution(client, USMCA, start, end);
  scorecard = await computeDriverDamageScorecard(client, USMCA, start, end);
  const facts = await client.query(fleetUnitFactsSql(), [USMCA]);
  const now = new Date();
  fleet = facts.rows.map((r) =>
    classifyFleetUnit(
      { unitId: r.unit_id, unitNumber: r.unit_number, isSampleData: r.is_sample_data, lastGpsAt: r.last_gps_at ? new Date(r.last_gps_at) : null, everHadOdometer: r.ever_had_odometer },
      now
    )
  );
  await client.query("ROLLBACK");
} finally {
  await client.end();
}

const problems = [];
const factsById = new Map(fleet.map((u) => [u.unitId, u]));
for (const e of coverage.events) {
  if (e.attribution === "attributed" && !e.driver_id) problems.push(`${e.source} ${e.event_id}: attributed without a driver`);
  if (e.attribution === "gap" && !e.gap_reason) problems.push(`${e.source} ${e.event_id}: gap without a reason`);
  const u = e.unit_id ? factsById.get(e.unit_id) : null;
  if (u && u.fleetClass === "sample" && !u.isSampleData) problems.push(`${e.unit_number}: classed sample without is_sample_data`);
}
const eventDrivers = new Set(coverage.events.filter((e) => e.driver_id).map((e) => e.driver_id));
const scoreDrivers = new Set(scorecard.map((r) => r.driver_id));
const missing = [...eventDrivers].filter((d) => !scoreDrivers.has(d));
const extra = [...scoreDrivers].filter((d) => !eventDrivers.has(d));
if (missing.length || extra.length) problems.push(`scorecard/event drivers disagree: missing ${missing.join(",")} extra ${extra.join(",")}`);

if (problems.length > 0) {
  console.error(`${LABEL}: FAIL — ${problems.slice(0, 10).join("; ")}`);
  process.exit(1);
}
const byClass = (c) => fleet.filter((u) => u.fleetClass === c);
console.log(
  `${LABEL}: LIVE PASS — fleet MEASURED via live-fleet.ts: ${byClass("reporting").length} reporting, ` +
    `${byClass("dark").length} REAL TRUCKS DARK (${byClass("dark").map((u) => u.unitNumber).join(", ")}), ` +
    `${byClass("no_telemetry_ever").length} no telemetry ever, ${byClass("sample").length} sample. ` +
    `Damage events all-time: ${coverage.summary.total} — ${coverage.summary.attributed} attributed, ${coverage.summary.gap} gap ` +
    `${JSON.stringify(coverage.summary.gap_by_reason)}; where they sit ${JSON.stringify(coverage.summary.by_unit_fleet_class)}. ` +
    `Scorecard drivers (${scoreDrivers.size}) match event-level attribution exactly.`
);
