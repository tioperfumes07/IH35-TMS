/**
 * AUTH-191 — link the two live USMCA factoring advances whose invoices were voided under AUTH-176 (owner rule: no
 * invoice on an undelivered load) to their loads through the FK added by migration 202615170800:
 *   FAC-2026-00139 (Faro 103, PO LGMX142) -> load 13625   ·   FAC-2026-00140 (Faro 104, PO 005804613) -> load 13626
 * Evidence: each load's own customer PO equals the Faro PO exactly, and the owner's reconciliation
 * (09-30-26-UPDATED FIRST RECONCILIATION.xlsx rows 113/114) names the same loads. Header link ONLY: no amount, no
 * journal entry, no status. When each load's invoice is sent at delivery, trg_invoice_link_pre_invoice_advance links it.
 *
 * Run: DATABASE_URL=<prod> npx tsx scripts/ops/2026-10-01-cc2-auth191-advance-load-links.ts [--apply]
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { assertIsIntendedProduction } from "../lib/assert-not-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const APPLY = process.argv.includes("--apply");
const AUTH_ID = "AUTH-191";
const LINKS = [
  { advance: "FAC-2026-00139", faro: "103", load: "13625", po: "LGMX142" },
  { advance: "FAC-2026-00140", faro: "104", load: "13626", po: "005804613" },
];

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
  const client = new pg.Client({ connectionString: url, statement_timeout: 20000 });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '5s'");
    if (APPLY) await assertIsIntendedProduction(client);
    await client.query("SET LOCAL ROLE neondb_owner");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const plan: Array<{ advance_id: string; load_id: string; label: string }> = [];
    for (const l of LINKS) {
      const a = (await client.query<{ id: string; faro_invoice_number: string; source_load_id: string | null; voided_at: string | null; live_invoices: number }>(
        `SELECT a.id::text, a.faro_invoice_number, a.source_load_id::text, a.voided_at::text,
                (SELECT count(*)::int FROM accounting.invoices i WHERE i.factoring_advance_id = a.id AND i.voided_at IS NULL) AS live_invoices
           FROM accounting.factoring_advances a WHERE a.operating_company_id = $1::uuid AND a.display_id = $2 FOR UPDATE`,
        [USMCA, l.advance]
      )).rows[0];
      const ld = (await client.query<{ id: string; customer_po_number: string | null; customer_wo_number: string | null }>(
        `SELECT id::text, customer_po_number, customer_wo_number FROM mdata.loads
          WHERE operating_company_id = $1::uuid AND load_number = $2 AND soft_deleted_at IS NULL`,
        [USMCA, l.load]
      )).rows;
      if (!a || a.voided_at) throw new Error(`STOP: ${l.advance} missing or voided`);
      if (a.faro_invoice_number !== l.faro) throw new Error(`STOP: ${l.advance} is Faro ${a.faro_invoice_number}, expected ${l.faro}`);
      if (a.live_invoices !== 0) throw new Error(`STOP: ${l.advance} already reaches a live invoice`);
      if (a.source_load_id) throw new Error(`STOP: ${l.advance} already linked to ${a.source_load_id}`);
      if (ld.length !== 1) throw new Error(`STOP: load ${l.load} found ${ld.length} times`);
      if (ld[0]!.customer_po_number !== l.po && ld[0]!.customer_wo_number !== l.po) throw new Error(`STOP: load ${l.load} PO is not ${l.po}`);
      plan.push({ advance_id: a.id, load_id: ld[0]!.id, label: `${l.advance} -> ${l.load}` });
    }
    console.log(`plan: ${plan.map((p) => p.label).join(", ")}`);
    if (!APPLY) {
      await client.query("ROLLBACK");
      console.log("DRY RUN: header link only. Re-run with --apply.");
      return;
    }
    for (const p of plan) {
      const u = await client.query(`UPDATE accounting.factoring_advances SET source_load_id = $2::uuid WHERE id = $1::uuid AND source_load_id IS NULL`, [p.advance_id, p.load_id]);
      if (u.rowCount !== 1) throw new Error(`STOP: ${p.label} not updated`);
    }
    await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
      "accounting.factoring_advance_load_linked", "info", JSON.stringify({ auth: AUTH_ID, links: plan }), `CC-2-${AUTH_ID}`,
    ]);
    await client.query("COMMIT");
    console.log(`APPLIED under ${AUTH_ID}: ${plan.length} advances linked to their loads; 1 audit row.`);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

await main();
