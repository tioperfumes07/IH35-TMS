#!/usr/bin/env node
// ROUND 305 B-49: "Attribute the 46. State the 70 as a gap. NEVER attribute a finding you cannot place."
//
// --selftest (no DB): attributionFor() never attributes without a driver from the assignment
//   window, and every gap carries a named reason — including "no_driver_logged_in", the case where
//   a window covers the moment but records no driver (Samsara: truck in use, nobody signed in).
// live: runs listIntegrityFindingsAttribution() on USMCA and FAILS if any attributed row disagrees
//   with an independent recomputation of the time-boxed predicate, any gap row lacks a reason, or
//   the summary does not add up. It does NOT freeze 46/70 — the split moves as assignment coverage
//   moves, and the live figure is what gets reported.
import pg from "pg";
import { register as registerTsx } from "tsx/esm/api";

registerTsx();

const LABEL = "verify-integrity-findings-attribution-honest";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const svc = () => import(new URL("../../apps/backend/src/maintenance/integrity-findings-attribution.service.ts", import.meta.url));

async function selftest() {
  const assert = (await import("node:assert/strict")).default;
  const { attributionFor } = await svc();
  const t = new Date("2026-09-25T00:00Z");
  assert.equal(attributionFor({ unit_id: "u", occurred_at: t, driver_id: "d", unit_ever_assigned: true, covered_at_time: true }).attribution, "attributed");
  assert.equal(attributionFor({ unit_id: null, occurred_at: t, driver_id: null, unit_ever_assigned: false, covered_at_time: false }).gap_reason, "no_unit_on_finding");
  assert.equal(attributionFor({ unit_id: "u", occurred_at: t, driver_id: null, unit_ever_assigned: false, covered_at_time: false }).gap_reason, "unit_never_assigned");
  assert.equal(attributionFor({ unit_id: "u", occurred_at: t, driver_id: null, unit_ever_assigned: true, covered_at_time: true }).gap_reason, "no_driver_logged_in", "a covering window with no driver must never be attributed");
  assert.equal(attributionFor({ unit_id: "u", occurred_at: t, driver_id: null, unit_ever_assigned: true, covered_at_time: false }).gap_reason, "no_assignment_at_time");
  console.log(`${LABEL} --selftest PASS (5/5)`);
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

const { listIntegrityFindingsAttribution } = await svc();
let result;
let independent;
try {
  await client.query("BEGIN");
  await client.query("SET LOCAL ROLE neondb_owner");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  result = await listIntegrityFindingsAttribution(client, USMCA);
  // Independent recomputation, written out by hand rather than through driverAtTimeSql.
  independent = await client.query(
    `SELECT f.uuid::text AS id,
            (SELECT a.driver_id::text FROM telematics.vehicle_driver_assignments a
              WHERE a.operating_company_id = f.operating_company_id AND a.unit_id::text = f.unit_id
                AND a.started_at <= f.occurred_at AND (a.ended_at IS NULL OR a.ended_at > f.occurred_at)
              ORDER BY a.started_at DESC, a.created_at DESC LIMIT 1) AS driver_id
       FROM safety.integrity_findings f WHERE f.operating_company_id = $1::uuid`,
    [USMCA]
  );
  await client.query("ROLLBACK");
} finally {
  await client.end();
}

const truth = new Map(independent.rows.map((r) => [r.id, r.driver_id]));
const problems = [];
for (const f of result.rows) {
  const expected = truth.get(f.finding_id) ?? null;
  if (f.driver_id !== expected) problems.push(`${f.finding_id}: engine driver ${f.driver_id} != window driver ${expected}`);
  if (f.attribution === "attributed" && !f.driver_id) problems.push(`${f.finding_id}: attributed with no driver`);
  if (f.attribution === "gap" && (!f.gap_reason || !f.attribution_note)) problems.push(`${f.finding_id}: gap without a reason`);
}
const s = result.summary;
const reasonSum = Object.values(s.gap_by_reason).reduce((a, b) => a + b, 0);
if (s.attributed + s.gap !== s.total || reasonSum !== s.gap || s.total !== result.rows.length) {
  problems.push(`summary does not add up: ${JSON.stringify(s)}`);
}
if (problems.length > 0) {
  console.error(`${LABEL}: FAIL — ${problems.slice(0, 10).join("; ")}`);
  process.exit(1);
}
console.log(
  `${LABEL}: LIVE PASS — ${s.total} findings: ${s.attributed} attributed (each matches an independent window recomputation), ` +
    `${s.gap} stated as a gap ${JSON.stringify(s.gap_by_reason)}; by class ${JSON.stringify(s.by_anomaly_class)}.`
);
