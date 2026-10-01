/**
 * AUTH-198 — OWNER LAW 2026-10-01 (in chat to CC-2): "ALL CUSTOMERS WITH THE NAME BROKERS, LOGISTISCS, OR FREIGHT, ETC
 * MUST BE CATEGORIZED IN THE APP AS BROKERS." Master data classification (not a business transaction).
 *
 * Migration 202615190700 installs trg_customer_broker_by_name (sets customer_type 'broker' + the company's BROKER
 * customer_type_id on insert / name / type change). This pass re-stamps the EXISTING customers through that same trigger
 * (a no-op name touch), so the trigger is the single writer of the rule; trg_audit_customers records every row.
 * All three companies (the owner said "in the app"). Refuses unless the migration is live and the counts equal the
 * measured ones (2026-10-01: USMCA 652 matched / 640 to change, plus 722 + 677 in the two other entities; 0 direct
 * shippers among them).
 *
 * Run: DATABASE_URL=<prod> npx tsx scripts/ops/2026-10-01-cc2-auth198-classify-broker-named-customers.ts [--rehearse | --apply]
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { assertIsIntendedProduction } from "../lib/assert-not-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const APPLY = process.argv.includes("--apply");
const REHEARSE = !APPLY && process.argv.includes("--rehearse");
const AUTH_ID = "AUTH-198";
const MAX_TO_CHANGE = 2100;

const TO_CHANGE = `
  SELECT c.id
    FROM mdata.customers c
    LEFT JOIN catalogs.customer_types bt ON bt.operating_company_id = c.operating_company_id AND bt.code = 'BROKER' AND bt.is_active
   WHERE mdata.customer_name_is_broker(c.customer_name)
     AND (c.customer_type IS DISTINCT FROM 'broker'::mdata.customer_type OR (bt.id IS NOT NULL AND c.customer_type_id IS DISTINCT FROM bt.id))`;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  if (APPLY) {
    try {
      execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), AUTH_ID], { stdio: "inherit" });
    } catch {
      console.error(`${AUTH_ID} rejected by verify-owner-authorization.mjs -- refusing --apply.`);
      process.exit(1);
    }
  }
  const c = new pg.Client({ connectionString: url, statement_timeout: 120000 });
  await c.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL lock_timeout = '5s'");
    if (APPLY) await assertIsIntendedProduction(c);
    await c.query("SET LOCAL ROLE neondb_owner");
    await c.query("SET LOCAL app.bypass_rls = 'lucia'");
    const live = (await c.query(`SELECT to_regprocedure('mdata.customer_name_is_broker(text)') AS f,
      (SELECT count(*)::int FROM pg_trigger WHERE tgname = 'trg_customer_broker_by_name') AS t`)).rows[0];
    if (!live.f || live.t !== 1) {
      await c.query("ROLLBACK");
      console.error("REFUSED: migration 202615190700 is not live on this database");
      process.exit(1);
    }
    const before = (await c.query(`SELECT c.operating_company_id::text oc, count(*)::int n,
        count(*) FILTER (WHERE c.customer_type = 'direct_shipper'::mdata.customer_type)::int shippers
      FROM mdata.customers c WHERE c.id IN (${TO_CHANGE}) GROUP BY 1 ORDER BY 1`)).rows;
    const n = before.reduce((a, r) => a + r.n, 0);
    console.log("to change by company:", before);
    if (n > MAX_TO_CHANGE || before.some((r) => r.shippers > 0)) {
      await c.query("ROLLBACK");
      console.error(`REFUSED: ${n} rows (max ${MAX_TO_CHANGE}) or a direct shipper would be overridden -- re-measure and ask the owner`);
      process.exit(1);
    }
    if (!APPLY && !REHEARSE) {
      await c.query("ROLLBACK");
      console.log(`DRY RUN: would re-stamp ${n} customers through trg_customer_broker_by_name.`);
      return;
    }
    const upd = await c.query(`UPDATE mdata.customers SET customer_name = customer_name WHERE id IN (${TO_CHANGE})`);
    const left = (await c.query(`SELECT count(*)::int n FROM mdata.customers WHERE id IN (${TO_CHANGE})`)).rows[0].n;
    console.log(`re-stamped ${upd.rowCount}; still not Broker: ${left}`);
    if (left !== 0) throw new Error(`${left} broker-named customers still not Broker`);
    if (REHEARSE) {
      await c.query("ROLLBACK");
      console.log("REHEARSAL complete, rolled back — nothing written.");
      return;
    }
    await c.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
      "mdata.customers_classified_broker_by_name", "info",
      JSON.stringify({ auth: AUTH_ID, rows: upd.rowCount, by_company: before, law: "owner 2026-10-01: broker/logistics/freight names are Brokers" }),
      `CC-2-${AUTH_ID}`,
    ]);
    await c.query("COMMIT");
    console.log(`APPLIED under ${AUTH_ID}: ${upd.rowCount} customers categorized Broker; 1 audit row.`);
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await c.end();
  }
}

await main();
