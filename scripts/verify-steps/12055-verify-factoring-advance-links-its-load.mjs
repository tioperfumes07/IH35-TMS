#!/usr/bin/env node
// Factoring lane (Lead 2026-10-01 06:50Z): every live factoring advance reaches its load — directly
// (source_load_id, a factor purchase made before the TMS may invoice) or through a linked invoice. Measured
// 2026-10-01: FAC-2026-00139 (13625) and FAC-2026-00140 (13626) reached their loads only through notes text after
// AUTH-176 voided their invoices (owner rule: no invoice on an undelivered load), and Faro 102 (load 13638) could
// not be created at all. Migration 202615170800 adds the FK + the invoice auto-link trigger.
//
// static: migration shape, the route's pre-invoice path (load_id + purchase_cents + match law), the list filter.
// live (read-only): 0 live advances without a load path, once the column is on this database.
import pg from "pg";
import { readFileSync } from "node:fs";

const LABEL = "verify-factoring-advance-links-its-load";
// Named exceptions — an advance on a real app invoice that has NO load, per the owner's reconciliation
// (09-30-26-UPDATED FIRST RECONCILIATION.xlsx row 9: Faro 7, ITS Logistics $350, "NO ALLWAYS LOAD").
const NO_LOAD_EXCEPTIONS = ["FAC-2026-00007"];
const ROOT = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), "utf8");

function selftest() {
  const problems = [];
  const mig = read("db/migrations/202615170800_factoring_advance_source_load_and_invoice_autolink.sql");
  if (!/ADD COLUMN IF NOT EXISTS source_load_id uuid NULL REFERENCES mdata\.loads\(id\)/.test(mig)) problems.push("source_load_id FK");
  if (!/BEFORE INSERT OR UPDATE OF status ON accounting\.invoices/.test(mig) || !/IF v_count = 1 THEN/.test(mig)) problems.push("invoice auto-link must link only a single open candidate");
  if (!/status NOT IN \('disputed', 'voided'\)/.test(mig)) problems.push("disputed/voided advances must never auto-link");
  if (!/SET LOCAL lock_timeout/.test(mig)) problems.push("DDL on accounting.invoices must carry a lock_timeout");
  const r = read("apps/backend/src/accounting/factoring-advances.routes.ts");
  if (!/load_id: z\.string\(\)\.uuid\(\)\.optional\(\),\s*\n\s*purchase_cents/.test(r)) problems.push("create accepts load_id + purchase_cents");
  if (!/a pre-invoice purchase must name the factor's PO/.test(r)) problems.push("pre-invoice path keeps the PO match law");
  if (!/load_has_live_invoice_use_invoice_ids/.test(r) || !/load_already_has_open_advance/.test(r)) problems.push("pre-invoice path refuses a live invoice / second advance");
  if (!/fa\.source_load_id = \$\$\{values\.length\}::uuid OR EXISTS/.test(r)) problems.push("list ?load_id= must include direct advances");
  if (problems.length) {
    console.error(`${LABEL} --selftest FAIL — ${problems.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (8/8)`);
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
  await client.query("BEGIN");
  const hasOwner = (await client.query(`SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner'`)).rows.length > 0;
  if (hasOwner) await client.query("SET LOCAL ROLE neondb_owner");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  const col = (await client.query(`SELECT 1 FROM information_schema.columns WHERE table_schema='accounting' AND table_name='factoring_advances' AND column_name='source_load_id'`)).rows.length > 0;
  if (!col) {
    await client.query("ROLLBACK");
    console.log(`DATABASE PHASE: factoring_advances.source_load_id not on this database yet (migration 202615170800 lands with the next deploy) — static proof only, NOT live proof`);
    process.exit(0);
  }
  const r = (await client.query(`
    SELECT count(*)::int AS live,
           count(*) FILTER (WHERE a.display_id <> ALL($1::text[]) AND a.source_load_id IS NULL AND NOT EXISTS (
             SELECT 1 FROM accounting.invoices i WHERE i.factoring_advance_id = a.id AND i.source_load_id IS NOT NULL))::int AS no_load_path,
           coalesce(json_agg(a.display_id) FILTER (WHERE a.display_id <> ALL($1::text[]) AND a.source_load_id IS NULL AND NOT EXISTS (
             SELECT 1 FROM accounting.invoices i WHERE i.factoring_advance_id = a.id AND i.source_load_id IS NOT NULL)), '[]') AS ids,
           count(*) FILTER (WHERE a.source_load_id IS NOT NULL)::int AS direct
      FROM accounting.factoring_advances a WHERE a.voided_at IS NULL`, [NO_LOAD_EXCEPTIONS])).rows[0];
  await client.query("ROLLBACK");
  if (r.no_load_path > 0) {
    console.error(`${LABEL}: FAIL — ${r.no_load_path} live advance(s) reach no load: ${JSON.stringify(r.ids).slice(0, 300)}`);
    process.exit(1);
  }
  console.log(`${LABEL}: LIVE PASS — ${r.live} live advances (positive control), every one reaches its load (${r.direct} directly, the rest through an invoice) except the named no-load exception(s) ${NO_LOAD_EXCEPTIONS.join(", ")}.`);
} finally {
  await client.end();
}
