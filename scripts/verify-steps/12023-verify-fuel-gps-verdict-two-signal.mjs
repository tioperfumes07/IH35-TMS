#!/usr/bin/env node
// ROUND 306 E-22 fix + Lead NEXT 3 (Fuel page read model).
// The old matcher placed fuel-merchant bank lines on "the company truck with a GPS fix closest in
// time to the row's DB insert time" — never compared with the station. Now: bank lines are never
// placed on a truck; purchases with a station + pump time (Relay fills) get a two-signal verdict
// (card truck vs truck GPS shows stopped at the pump): match / held / proposal / unverifiable /
// no_candidate. The Fuel page read model carries that verdict and the fraud classification, with why.
//
// --selftest: classifyGpsVerdict every branch; static: the bank-line matcher queries no GPS.
// live: on USMCA, every "match" really has the card truck among the stopped trucks within the
//   radius; no verdict lacks a why; every card row is either a purchase or names why it is not.
import pg from "pg";
import { readFileSync } from "node:fs";
import { register as registerTsx } from "tsx/esm/api";

registerTsx();

const LABEL = "verify-fuel-gps-verdict-two-signal";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ROOT = new URL("../../", import.meta.url);
const mod = (p) => import(new URL(p, ROOT));

async function selftest() {
  const assert = (await import("node:assert/strict")).default;
  const { classifyGpsVerdict } = await mod("apps/backend/src/fuel/fuel-gps-verdict.service.ts");
  const c = (unit_id) => ({ unit_id, unit_number: unit_id, metres: 100, at: "2026-09-26T00:00:00Z" });
  assert.equal(classifyGpsVerdict({ cardUnitId: "u1", cardUnitHasFixes: true, candidates: [c("u1"), c("u2")] }).verdict, "match");
  assert.equal(classifyGpsVerdict({ cardUnitId: "u1", cardUnitHasFixes: true, candidates: [c("u2")] }).verdict, "held");
  assert.equal(classifyGpsVerdict({ cardUnitId: "u1", cardUnitHasFixes: true, candidates: [] }).verdict, "held");
  assert.equal(classifyGpsVerdict({ cardUnitId: "u1", cardUnitHasFixes: false, candidates: [] }).verdict, "unverifiable");
  assert.equal(classifyGpsVerdict({ cardUnitId: null, cardUnitHasFixes: false, candidates: [c("u3")] }).verdict, "proposal");
  assert.equal(classifyGpsVerdict({ cardUnitId: null, cardUnitHasFixes: false, candidates: [c("u3"), c("u4")] }).verdict, "held");
  assert.equal(classifyGpsVerdict({ cardUnitId: null, cardUnitHasFixes: false, candidates: [] }).verdict, "no_candidate");
  assert.match(classifyGpsVerdict({ cardUnitId: null, cardUnitNumber: "T169", cardUnitHasFixes: false, candidates: [] }).why, /T169.*not a truck in this company/);
  const svc = readFileSync(new URL("apps/backend/src/safety/fuel-gps-match.service.ts", ROOT), "utf8");
  assert.ok(!/telematics\.vehicle_locations/.test(svc), "the bank-line matcher must not pick a truck from GPS by time");
  console.log(`${LABEL} --selftest PASS (9/9)`);
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

const { computeFuelIntegrityVerdicts } = await mod("apps/backend/src/fuel/fuel-integrity-verdicts.service.ts");
const { GPS_RADIUS_M } = await mod("apps/backend/src/fuel/fuel-gps-verdict.service.ts");
let r;
try {
  await client.query("BEGIN");
  await client.query("SET LOCAL ROLE neondb_owner");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  await client.query("SET LOCAL default_transaction_read_only = on");
  const end = new Date();
  r = await computeFuelIntegrityVerdicts(client, USMCA, new Date(end.getTime() - 45 * 86_400_000).toISOString(), end.toISOString());
  await client.query("ROLLBACK");
} finally {
  await client.end();
}

const problems = [];
for (const f of r.relay_fills) {
  if (!f.why) problems.push(`${f.transaction_id}: verdict without why`);
  if (f.verdict === "match" && !f.candidates.some((c) => c.unit_id === f.card_unit_id && c.metres <= GPS_RADIUS_M)) {
    problems.push(`${f.transaction_id}: "match" but the card truck is not among the stopped trucks`);
  }
}
for (const c of r.card_rows) {
  if (!c.why) problems.push(`${c.fuel_transaction_id}: card row without why`);
  if (!c.is_purchase && !c.not_purchase_reason) problems.push(`${c.fuel_transaction_id}: not a purchase but no reason`);
}
if (problems.length) {
  console.error(`${LABEL}: FAIL — ${problems.slice(0, 10).join("; ")}`);
  process.exit(1);
}
console.log(`${LABEL}: LIVE PASS — last 45 days, read-only: ${JSON.stringify(r.summary)}; every match has the card truck stopped within ${GPS_RADIUS_M} m; every verdict states why.`);
