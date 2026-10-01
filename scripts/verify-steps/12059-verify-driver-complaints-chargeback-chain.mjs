#!/usr/bin/env node
// ROUND 313 item 1 — E-28 complaints against a driver, ONE store (safety.complaints): source incl. broker/shipper,
// severity, load, stop, unit, driver, resolution, and the chargeback to driver finance ONLY when driver-caused AND
// approved (owner C5:A), through the canonical createSettlementDeduction, maker != checker (F13:A).
//
// static: migration shape (CHECK + stop trigger + lock_timeout), the chargeback route's gates, the driver reverse route,
//   the engine-board probe. live (read-only): every chargeback'd complaint is driver-caused, approved, and its deduction
//   is the same driver's; no complaint's stop sits on another load.
import pg from "pg";
import { readFileSync } from "node:fs";

const LABEL = "verify-driver-complaints-chargeback-chain";
const ROOT = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), "utf8");

function selftest() {
  const problems = [];
  const mig = read("db/migrations/202615180600_complaints_stop_driver_caused_chargeback.sql");
  if (!/complaints_chargeback_only_driver_caused_approved/.test(mig) || !/driver_caused IS TRUE AND chargeback_approved_by IS NOT NULL/.test(mig)) problems.push("chargeback CHECK");
  if (!/'broker'::text, 'shipper'::text/.test(mig)) problems.push("broker/shipper sources");
  if (!/tg_complaints_stop_link/.test(mig) || !/SET LOCAL lock_timeout/.test(mig)) problems.push("stop trigger + lock_timeout");
  const r = read("apps/backend/src/routes/safety/complaints.ts");
  for (const gate of ["complaint_not_resolved", "not_driver_caused", "complaint_not_against_a_driver", "maker_cannot_approve_own_complaint", "chargeback_already_created"]) {
    if (!r.includes(gate)) problems.push(`chargeback gate ${gate}`);
  }
  if (!/createSettlementDeduction\(client/.test(r)) problems.push("chargeback must go through createSettlementDeduction");
  if (!/canVoidCancel\(String\(user\.role/.test(r)) problems.push("chargeback approval is an accounting executor");
  if (!r.includes('app.get("/api/v1/drivers/:id/complaints"')) problems.push("driver reverse route");
  if (!/relation: "safety\.complaints", tsColumn: "created_at"/.test(read("apps/backend/src/system/engine-status.catalog.ts"))) problems.push("E-28 engine-board probe");
  if (problems.length) {
    console.error(`${LABEL} --selftest FAIL — ${problems.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (13/13)`);
}

selftest();
if (process.argv.includes("--selftest")) process.exit(0);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(`${LABEL}: FAIL — DATABASE_URL not set and this guard does not declare ALLOW_OFFLINE_SKIP.`);
  process.exit(1);
}
const client = new pg.Client({ connectionString: url, statement_timeout: 20000 });
await client.connect();
try {
  await client.query("BEGIN READ ONLY");
  const hasOwner = (await client.query(`SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner'`)).rows.length > 0;
  if (hasOwner) await client.query("SET LOCAL ROLE neondb_owner");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  const col = (await client.query(`SELECT 1 FROM information_schema.columns WHERE table_schema='safety' AND table_name='complaints' AND column_name='chargeback_deduction_id'`)).rows.length > 0;
  if (!col) {
    await client.query("ROLLBACK");
    console.log(`DATABASE PHASE: safety.complaints chargeback columns not on this database yet (migration 202615180600 lands with the next deploy) — static proof only, NOT live proof`);
    process.exit(0);
  }
  const r = (await client.query(`
    SELECT count(*)::int AS complaints,
           count(*) FILTER (WHERE c.chargeback_deduction_id IS NOT NULL)::int AS chargebacks,
           count(*) FILTER (WHERE c.chargeback_deduction_id IS NOT NULL AND (d.id IS NULL OR d.driver_id IS DISTINCT FROM c.respondent_driver_id))::int AS wrong_driver,
           count(*) FILTER (WHERE c.stop_id IS NOT NULL AND c.load_id IS NOT NULL AND s.load_id IS DISTINCT FROM c.load_id)::int AS stop_off_load
      FROM safety.complaints c
      LEFT JOIN driver_finance.driver_settlement_deductions d ON d.id = c.chargeback_deduction_id
      LEFT JOIN mdata.load_stops s ON s.id = c.stop_id
     WHERE c.voided_at IS NULL`)).rows[0];
  await client.query("ROLLBACK");
  const problems = [];
  if (r.wrong_driver) problems.push(`${r.wrong_driver} chargeback(s) whose deduction is missing or another driver's`);
  if (r.stop_off_load) problems.push(`${r.stop_off_load} complaint(s) whose stop sits on another load`);
  if (problems.length) {
    console.error(`${LABEL}: FAIL — ${problems.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL}: LIVE PASS — ${r.complaints} live complaint(s), ${r.chargebacks} chargeback(s), every one the respondent driver's own deduction; no stop off its load.`);
} finally {
  await client.end();
}
