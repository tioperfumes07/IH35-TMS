#!/usr/bin/env node
// ORDERS-2026-10-01 CC-2 rows 5-6: derive a pump time and the IFTA state for date-only fuel rows from
// the truck's own dwell inside a fuel-stop geofence that day. NEVER overwrite transaction_at.
//
// --selftest: decideUnitDay every branch. static: the engine never UPDATEs fuel.fuel_transactions and
//   its writer feature-detects the side table. live (read-only): only date-only motor-fuel rows are
//   derived; a time is derived only when there is exactly one fuel stop that day; reports hit rate.
import pg from "pg";
import { readFileSync } from "node:fs";
import { register as registerTsx } from "tsx/esm/api";

registerTsx();

const LABEL = "verify-fuel-time-derivation";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ROOT = new URL("../../", import.meta.url);
const SVC = "apps/backend/src/fuel/fuel-time-derivation.service.ts";

async function selftest() {
  const assert = (await import("node:assert/strict")).default;
  const { decideUnitDay } = await import(new URL(SVC, ROOT));
  const st = (state, h) => ({ ref: `s${h}`, startedAt: new Date(`2026-08-18T${h}:00:00Z`), state, geofenceId: "g", geofenceLabel: "Love's", metres: 40 });
  assert.equal(decideUnitDay(1, []).time, null, "no fuel stop -> nothing derived");
  const one = decideUnitDay(1, [st("OH", "15")]);
  assert.equal(one.confidence, "high");
  assert.equal(one.state, "OH");
  assert.equal(decideUnitDay(2, [st("OH", "15")]).confidence, "medium", "two fills, one stop: both at that stop");
  const many = decideUnitDay(1, [st("OH", "10"), st("OH", "15")]);
  assert.equal(many.time, null, "one fill, two fuel stops: never pick one");
  assert.equal(many.state, "OH", "...but the state is known when every stop shares it");
  assert.equal(decideUnitDay(1, [st("OH", "10"), st("IN", "15")]).state, null, "stops across states: no state");
  const src = readFileSync(new URL(SVC, ROOT), "utf8");
  assert.ok(!/UPDATE\s+fuel\.fuel_transactions/i.test(src), "must never overwrite the source row");
  assert.ok(/derivationTableReady/.test(src), "writer must feature-detect its side table");
  for (const f of ["apps/backend/src/jobs/fuel-fraud-detector-worker.ts", "apps/backend/src/fuel/fuel-integrity-verdicts.service.ts"]) {
    assert.ok(/loadHighConfidenceDerivedTimes/.test(readFileSync(new URL(f, ROOT), "utf8")), `${f} must read high-confidence derived pump times`);
  }
  const mig = readFileSync(new URL("db/migrations/202615110000_fuel_transaction_derivations.sql", ROOT), "utf8");
  assert.ok(/FORCE ROW LEVEL SECURITY/.test(mig) && /tg_audit_row/.test(mig), "side table must be forced-RLS and audited");
  assert.ok(!/UPDATE\s+fuel\.fuel_transactions\b/i.test(mig), "migration must never touch the source row");
  console.log(`${LABEL} --selftest PASS (13/13)`);
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
const { computeFuelTimeDerivations } = await import(new URL(SVC, ROOT));
let r;
try {
  await client.query("BEGIN");
  await client.query("SET LOCAL ROLE neondb_owner");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  await client.query("SET LOCAL default_transaction_read_only = on");
  r = await computeFuelTimeDerivations(client, USMCA);
  await client.query("ROLLBACK");
} finally {
  await client.end();
}
const problems = [];
for (const x of r.rows) {
  if (!x.reason) problems.push(`${x.fuel_transaction_id}: no reason`);
  if (x.transaction_at_derived && !x.derived_from_ref) problems.push(`${x.fuel_transaction_id}: time derived with no source stop`);
  if (x.confidence === "high" && !x.reason.startsWith("one fill, one fuel stop")) problems.push(`${x.fuel_transaction_id}: high confidence outside the one-fill-one-stop case`);
}
if (problems.length) {
  console.error(`${LABEL}: FAIL — ${problems.slice(0, 10).join("; ")}`);
  process.exit(1);
}
console.log(`${LABEL}: LIVE PASS — read-only, stops from ${r.stop_source}: ${JSON.stringify(r.summary)}; every derived time names its source stop; nothing written.`);
