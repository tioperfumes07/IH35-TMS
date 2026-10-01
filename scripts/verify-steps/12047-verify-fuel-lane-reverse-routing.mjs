#!/usr/bin/env node
// Linkage law §6 ("a link that resolves one way and not the other is half a link") for CC-2's fuel lane.
// Audit 2026-10-01 found four half-links: a vendor page could not list its fuel purchases; fraud alerts
// reached no truck/driver/load/vendor; a fuel purchase could not drill to its expense document and JE
// (nor the document back to its purchase); Relay fills (never bridged into fuel.fuel_transactions)
// were reachable from no hub — 100 of USMCA's 119 had no truck or driver matched.
//
// static: each route accepts the hub filter and returns the link columns. live (read-only): the SQL
// shapes the routes use resolve on this database and the positive controls are non-zero.
import pg from "pg";
import { readFileSync } from "node:fs";

const LABEL = "verify-fuel-lane-reverse-routing";
const ROOT = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), "utf8");

function selftest() {
  const problems = [];
  const ft = read("apps/backend/src/fuel/fuel-transactions.routes.ts");
  if (!/vendor_id: z\.string\(\)\.uuid\(\)\.optional\(\)/.test(ft) || !/ft\.vendor_id = \$/.test(ft)) problems.push("fuel transactions list must filter by vendor_id");
  if (!/source_fuel_transaction_id = ft\.id/.test(ft) || !/journal_entry_id: row\.journal_entry_id/.test(ft)) problems.push("fuel transactions must carry their expense + JE (forward drill)");
  const fa = read("apps/backend/src/integrations/fuel/fraud-detector/routes.ts");
  for (const k of ["unit_id", "driver_id", "load_id", "vendor_id"]) if (!new RegExp(`\\["${k}", "ft\\.${k}"\\]`).test(fa)) problems.push(`fraud alerts must filter by ${k}`);
  const ex = read("apps/backend/src/accounting/expenses.routes.ts");
  if (!/AS source_fuel_transaction_id/.test(ex) || !/AS source_fuel_voided_at/.test(ex)) problems.push("expense detail must link back to its fuel purchase and say when it is voided");
  const rf = read("apps/backend/src/fuel/relay-fills.routes.ts");
  if (!/r\.matched_unit_id = \$/.test(rf) || !/r\.matched_driver_id = \$/.test(rf) || !/unmatched === "true"/.test(rf)) problems.push("Relay fills must list by unit, driver and unmatched");
  if (!/registerRelayFillRoutes\(app\)/.test(read("apps/backend/src/index.ts"))) problems.push("Relay fills route must be mounted");
  if (problems.length) {
    console.error(`${LABEL} --selftest FAIL — ${problems.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (10/10)`);
}

selftest();
if (process.argv.includes("--selftest")) process.exit(0);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(`${LABEL}: FAIL — DATABASE_URL not set and this guard does not declare ALLOW_OFFLINE_SKIP.`);
  process.exit(1);
}
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("BEGIN");
  const hasOwner = (await client.query(`SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner'`)).rows.length > 0;
  if (hasOwner) await client.query("SET LOCAL ROLE neondb_owner");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  const probe = await client.query("SELECT 1 FROM org.companies WHERE id = $1::uuid", [USMCA]);
  if (probe.rows.length === 0) {
    await client.query("ROLLBACK");
    console.log(`DATABASE PHASE: USMCA company absent (fresh CI DB) — static proof only, NOT live proof`);
    process.exit(0);
  }
  const r = (await client.query(
    `SELECT
       (SELECT count(*)::int FROM fuel.fuel_transactions WHERE operating_company_id = $1 AND voided_at IS NULL) fuel,
       (SELECT count(*)::int FROM fuel.fuel_transactions ft WHERE ft.operating_company_id = $1 AND ft.voided_at IS NULL
          AND EXISTS (SELECT 1 FROM accounting.expenses e WHERE e.source_fuel_transaction_id = ft.id AND e.voided_at IS NULL)) fuel_with_doc,
       (SELECT count(*)::int FROM fuel.fuel_transactions WHERE operating_company_id = $1 AND voided_at IS NULL AND vendor_id IS NOT NULL) fuel_with_vendor,
       (SELECT count(*)::int FROM integrations.relay_fuel_transactions WHERE operating_company_id = $1 AND voided_at IS NULL) relay,
       (SELECT count(*)::int FROM integrations.relay_fuel_transactions WHERE operating_company_id = $1 AND voided_at IS NULL
          AND (matched_unit_id IS NULL OR matched_driver_id IS NULL)) relay_unmatched,
       (SELECT count(*)::int FROM fuel.fraud_alerts fa JOIN fuel.fuel_transactions ft ON ft.id = fa.fuel_transaction_uuid WHERE fa.operating_company_id = $1) alerts_reachable,
       (SELECT count(*)::int FROM fuel.fraud_alerts WHERE operating_company_id = $1) alerts`,
    [USMCA]
  )).rows[0];
  await client.query("ROLLBACK");
  const problems = [];
  if (r.alerts !== r.alerts_reachable) problems.push(`${r.alerts - r.alerts_reachable} fraud alert(s) name no live fuel purchase — unreachable from every hub`);
  if (r.fuel > 0 && r.fuel_with_vendor === 0) problems.push("positive control: no fuel purchase carries a vendor — the vendor reverse read would be vacuous");
  if (problems.length) {
    console.error(`${LABEL}: FAIL — ${problems.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL}: LIVE PASS — ${r.fuel} live fuel purchases (${r.fuel_with_vendor} with a vendor, ${r.fuel_with_doc} drill to an expense document); ${r.alerts} fraud alert(s), all reachable; ${r.relay} Relay fills, ${r.relay_unmatched} on the unmatched worklist.`);
} finally {
  await client.end();
}
