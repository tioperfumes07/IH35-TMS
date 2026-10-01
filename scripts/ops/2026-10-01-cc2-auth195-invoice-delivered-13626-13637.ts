/**
 * AUTH-195 — ROUND 315 addendum (Lead GO, owner authorization path named in OUTBOX-CC-3 #23803): issue the customer
 * invoice for the two GPS-delivered USMCA loads 13626 and 13637 through the APP'S OWN from-load engine — never a seed.
 * The exact chain the BOL auto-invoice path runs (auto-invoice-on-bol.service.ts): buildInvoiceFromLoad (official
 * draft: line from the load rate, income account, customer, class, issue/delivery/due stamps, broker-advance claim)
 * -> sendDraftInvoice (A/R journal entry DR 1100 customer subledger / CR income, status sent, sent_at). One audit row each.
 *
 * Delivery evidence (measured by CC-3, #23803): 13626 final stop actual_departure_at 2026-09-26 00:10:03Z (eld_geofence,
 * AUTH-179); 13637 delivery departure 2026-10-01 15:04:53Z (eld_geofence, live fence detector). Load status is NOT
 * touched (the owner enters the delivered transition himself — AUTH-192 scope note).
 *
 * Refuses unless each load is USMCA, is_sample_data=false, carries a rate and a customer, has a stamped delivery
 * departure, and has NO live invoice. Actor: the system actor (app engine), stamped as created_by.
 *
 * Run: DATABASE_URL=<prod> npx tsx scripts/ops/2026-10-01-cc2-auth195-invoice-delivered-13626-13637.ts [--rehearse | --apply]
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { assertIsIntendedProduction } from "../lib/assert-not-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const APPLY = process.argv.includes("--apply");
const REHEARSE = !APPLY && process.argv.includes("--rehearse");
const AUTH_ID = "AUTH-195";
const ACTOR = "00000000-0000-4000-8000-000000000001";
const LOADS = ["13626", "13637"];

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
  const { buildInvoiceFromLoad } = await import("../../apps/backend/src/accounting/from-load.js");
  const { sendDraftInvoice } = await import("../../apps/backend/src/accounting/invoice-send.service.js");
  const client = new pg.Client({ connectionString: url, statement_timeout: 60000 });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '5s'");
    if (APPLY) await assertIsIntendedProduction(client);
    await client.query("SET LOCAL ROLE neondb_owner");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [USMCA]);
    const loads = (await client.query<{ id: string; load_number: string; rate_total_cents: string; customer_id: string | null; is_sample_data: boolean; delivered_at: string | null; live_inv: number }>(
      `SELECT l.id::text, l.load_number, l.rate_total_cents::text, l.customer_id::text, l.is_sample_data,
              (SELECT max(s.actual_departure_at)::text FROM mdata.load_stops s WHERE s.load_id = l.id
                 AND s.sequence_number = (SELECT max(s2.sequence_number) FROM mdata.load_stops s2 WHERE s2.load_id = l.id)) AS delivered_at,
              (SELECT count(*)::int FROM accounting.invoices i WHERE i.source_load_id = l.id AND i.voided_at IS NULL) AS live_inv
         FROM mdata.loads l WHERE l.operating_company_id = $1::uuid AND l.load_number = ANY($2::text[]) FOR UPDATE OF l`,
      [USMCA, LOADS]
    )).rows;
    const problems: string[] = [];
    if (loads.length !== LOADS.length) problems.push(`found ${loads.length} of ${LOADS.length} loads`);
    for (const l of loads) {
      console.log(`  load ${l.load_number}: rate $${(Number(l.rate_total_cents) / 100).toFixed(2)} delivered ${l.delivered_at} live invoices ${l.live_inv}`);
      if (l.is_sample_data) problems.push(`${l.load_number} is sample data`);
      if (!l.customer_id) problems.push(`${l.load_number} has no customer`);
      if (!(Number(l.rate_total_cents) > 0)) problems.push(`${l.load_number} has no rate`);
      if (!l.delivered_at) problems.push(`${l.load_number} has no delivery departure stamp`);
      if (l.live_inv !== 0) problems.push(`${l.load_number} already has a live invoice`);
    }
    if (problems.length) {
      await client.query("ROLLBACK");
      console.error(`REFUSED: ${problems.join("; ")}`);
      process.exit(1);
    }
    if (!APPLY && !REHEARSE) {
      await client.query("ROLLBACK");
      console.log("DRY RUN: would build + send one invoice per load through the from-load engine. --rehearse or --apply.");
      return;
    }
    const issued: Array<Record<string, unknown>> = [];
    for (const l of loads) {
      const built = await buildInvoiceFromLoad(client as never, { userId: ACTOR, operatingCompanyId: USMCA, loadId: l.id, asProforma: false });
      const invoiceId = String(built.invoice.id);
      const sent = await sendDraftInvoice(client as never, { invoiceId, operatingCompanyId: USMCA, userId: ACTOR });
      if (!sent.ok) throw new Error(`send failed for ${l.load_number}: ${sent.error}${sent.message ? `:${sent.message}` : ""}`);
      const inv = (await client.query<Record<string, unknown>>(
        `SELECT i.id::text, i.display_id, i.status::text, i.total_cents::text, i.issue_date::text, i.delivery_date::text, i.due_date::text, i.sent_at::text,
                (SELECT count(*)::int FROM accounting.invoice_lines il WHERE il.invoice_id = i.id) AS lines,
                (SELECT string_agg(DISTINCT p.journal_entry_uuid::text, ',') FROM accounting.journal_entry_postings p
                  WHERE p.source_transaction_type = 'invoice' AND p.source_transaction_id::text = i.id::text) AS je_ids
           FROM accounting.invoices i WHERE i.id = $1::uuid`,
        [invoiceId]
      )).rows[0]!;
      const postings = (await client.query<{ account_number: string; debit_or_credit: string; amount_cents: string }>(
        `SELECT a.account_number, p.debit_or_credit, p.amount_cents::text FROM accounting.journal_entry_postings p
           JOIN catalogs.accounts a ON a.id = p.account_id
          WHERE p.journal_entry_uuid = ANY(string_to_array($1, ',')::uuid[]) ORDER BY p.debit_or_credit DESC, a.account_number`,
        [String(inv.je_ids ?? "")]
      )).rows;
      console.log(`  ${l.load_number} -> invoice ${inv.display_id} (${inv.id}) ${inv.status} $${(Number(inv.total_cents) / 100).toFixed(2)} lines ${inv.lines} issue ${inv.issue_date} due ${inv.due_date} JE ${inv.je_ids}`);
      for (const p of postings) console.log(`      ${p.debit_or_credit} ${p.account_number} ${(Number(p.amount_cents) / 100).toFixed(2)}`);
      if (inv.status !== "sent" || !inv.je_ids || Number(inv.lines) < 1) throw new Error(`${l.load_number}: invoice not fully issued (status ${inv.status}, lines ${inv.lines}, JE ${inv.je_ids})`);
      issued.push({ load_number: l.load_number, load_id: l.id, ...inv });
    }
    if (REHEARSE) {
      await client.query("ROLLBACK");
      console.log("REHEARSAL complete, rolled back — nothing written.");
      return;
    }
    await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, $4::uuid, $5)`, [
      "accounting.invoice_issued_from_load", "info",
      JSON.stringify({ auth: AUTH_ID, operating_company_id: USMCA, engine: "buildInvoiceFromLoad + sendDraftInvoice", issued }),
      ACTOR, `CC-2-${AUTH_ID}`,
    ]);
    await client.query("COMMIT");
    console.log(`APPLIED under ${AUTH_ID}: ${issued.length} invoices issued through the from-load engine; 1 audit row.`);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

await main();
process.exit(0);
