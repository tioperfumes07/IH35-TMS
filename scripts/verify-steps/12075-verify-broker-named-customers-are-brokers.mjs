#!/usr/bin/env node
// OWNER LAW 2026-10-01 (in chat to CC-2): "ALL CUSTOMERS WITH THE NAME BROKERS, LOGISTICS, OR FREIGHT, ETC MUST BE
// CATEGORIZED IN THE APP AS BROKERS." Migration 202615190700 enforces it on every insert / name / type change
// (trg_customer_broker_by_name sets customer_type 'broker' + the company's BROKER customer_type_id).
//
// static: the migration defines mdata.customer_name_is_broker with the owner's words and the BEFORE trigger on the
//         columns that can break the rule.
// live (read-only): 0 customers whose name matches the rule but whose customer_type is not broker, or whose
//         customer_type_id is not their company's BROKER row (when that company has one).
import pg from "pg";
import { readFileSync } from "node:fs";

const LABEL = "verify-broker-named-customers-are-brokers";
const ROOT = new URL("../../", import.meta.url);
const mig = readFileSync(new URL("db/migrations/202615190700_customer_broker_by_name.sql", ROOT), "utf8");

function selftest() {
  const problems = [];
  if (!/CREATE OR REPLACE FUNCTION mdata\.customer_name_is_broker\(p_name text\)/.test(mig)) problems.push("pattern function missing");
  for (const w of ["broker", "brokerage", "logistics", "freight"]) if (!new RegExp(`\\b${w}\\|`).test(mig) && !new RegExp(`\\|${w}\\b`).test(mig)) problems.push(`owner word '${w}' missing from the pattern`);
  if (!/BEFORE INSERT OR UPDATE OF customer_name, customer_type, customer_type_id, operating_company_id ON mdata\.customers/.test(mig)) problems.push("trigger must fire on insert + name/type/type-id/company change");
  if (!/NEW\.customer_type := 'broker'::mdata\.customer_type;/.test(mig) || !/code = 'BROKER'/.test(mig)) problems.push("trigger must set both fields");
  if (problems.length) {
    console.error(`${LABEL} --selftest FAIL — ${problems.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (4/4)`);
}

selftest();
if (process.argv.includes("--selftest")) process.exit(0);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(`${LABEL}: FAIL — DATABASE_URL not set (live guard fails closed).`);
  process.exit(1);
}
const client = new pg.Client({ connectionString: url, statement_timeout: 30000 });
await client.connect();
try {
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  const fn = (await client.query(`SELECT to_regprocedure('mdata.customer_name_is_broker(text)') AS f`)).rows[0].f;
  if (!fn) {
    await client.query("ROLLBACK");
    console.error(`${LABEL}: LIVE FAIL — migration 202615190700 not applied on this database`);
    process.exit(1);
  }
  const r = await client.query(
    `SELECT c.operating_company_id::text oc, count(*)::int n, (array_agg(c.customer_name ORDER BY c.customer_name))[1:5] sample
       FROM mdata.customers c
       LEFT JOIN catalogs.customer_types bt ON bt.operating_company_id = c.operating_company_id AND bt.code = 'BROKER' AND bt.is_active
      WHERE mdata.customer_name_is_broker(c.customer_name)
        AND (c.customer_type IS DISTINCT FROM 'broker'::mdata.customer_type OR (bt.id IS NOT NULL AND c.customer_type_id IS DISTINCT FROM bt.id))
      GROUP BY 1`
  );
  const total = (await client.query(`SELECT count(*)::int n FROM mdata.customers WHERE mdata.customer_name_is_broker(customer_name)`)).rows[0].n;
  await client.query("ROLLBACK");
  const bad = r.rows.reduce((a, x) => a + x.n, 0);
  if (bad) {
    console.error(`${LABEL}: LIVE FAIL — ${bad} broker-named customer(s) not categorized Broker: ${r.rows.map((x) => `${x.oc}: ${x.n} (e.g. ${x.sample.join(" | ")})`).join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL}: LIVE PASS — all ${total} broker-named customers are Broker (type + catalog id)`);
} finally {
  await client.end();
}
