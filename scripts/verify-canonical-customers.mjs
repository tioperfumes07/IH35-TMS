#!/usr/bin/env node
/**
 * ROUND 326 item 1: one canonical record per real customer per company.
 *   static -- the engine reads the live FK catalog (never a hand list only), keeps an alias + snapshot + repoint log,
 *             deletes the duplicate (no shells), and can reverse a merge;
 *   live   -- duplicate normalized-name groups in mdata.customers per company must not exceed the baseline
 *             (shrink-only; scripts/verify-canonical-customers.baseline.json). Fails closed without DATABASE_URL.
 */
import { readFileSync } from "node:fs";
import pg from "pg";
const svc = readFileSync("apps/backend/src/mdata/canonical/canonical-entities.service.ts", "utf8");
const fails = [];
if (!/k\.confrelid = \$1::regclass/.test(svc)) fails.push("engine must discover repoint targets from the live FK catalog");
if (!/INSERT INTO \$\{q\(cfg\.aliasTable\)\}/.test(svc) || !/snapshot/.test(svc)) fails.push("engine must keep an alias with the deleted row's snapshot");
if (!/DELETE FROM \$\{q\(cfg\.table\)\} WHERE id = \$1::uuid/.test(svc)) fails.push("engine must delete the merged duplicate (no cancelled shells)");
if (!/export async function reverseCanonicalMerge/.test(svc)) fails.push("merges must be reversible");
const baseline = JSON.parse(readFileSync("scripts/verify-canonical-customers.baseline.json", "utf8"));
if (!process.env.DATABASE_URL) { console.error("verify-canonical-customers: FAIL — DATABASE_URL not set (live guard fails closed)."); process.exit(1); }
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  await c.query("SELECT set_config('app.bypass_rls','lucia',true)");
  const r = await c.query(`SELECT operating_company_id::text oc, count(*)::int groups FROM (
      SELECT operating_company_id, upper(regexp_replace(customer_name,'[^A-Za-z0-9]','','g')) k FROM mdata.customers
       GROUP BY 1, 2 HAVING count(*) > 1 AND upper(regexp_replace(customer_name,'[^A-Za-z0-9]','','g')) <> '') g GROUP BY 1`);
  for (const x of r.rows) {
    const allowed = baseline.duplicate_groups[x.oc] ?? 0;
    if (x.groups > allowed) fails.push(`company ${x.oc}: ${x.groups} duplicate customer groups > baseline ${allowed}`);
    console.log(`company ${x.oc}: duplicate customer groups ${x.groups} (baseline ${allowed})`);
  }
  await c.query("ROLLBACK");
} finally { await c.end(); }
if (fails.length) { console.error("verify-canonical-customers: FAIL\n  " + fails.join("\n  ")); process.exit(1); }
console.log("verify-canonical-customers: OK");
