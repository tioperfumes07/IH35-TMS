/**
 * AUTH-197 — Lead ruling 2026-10-01 16:45Z item 1 + owner in chat ("I BELIEVE IT IS A DUPLICATE LOAD. LETS DELETE IT,
 * IF I AM INCORRECT WE CREATE IT IN THE FUTURE"): delete invoice 90007 ($350, ITS Logistics, Faro 7 / PO 68747) with
 * its 2 revenue JEs and load 90007, under one AUTH, keeping the audit rows. If the owner later finds it real, it is
 * created again through the engine.
 *
 * Sanctioned WORM purge bypass (SET LOCAL app.purge_auth_id): documents are void-stamped before delete. Order (every FK
 * measured live 2026-10-01):
 *   JEs 1ae2e78a (Revrec Event 1, DR 1150 / CR 4000 $350) + d324689e (Revrec Event 2, DR 1100 / CR 1150 $350):
 *     transaction_source_links, latch rows (load_revenue_recognition_postings), postings, void-stamp, delete.
 *   invoice 90007: void-stamp, invoice_lines, invoice.
 *   load 90007's OWN children: stops, assignment history, cancellation record, charge line, fuel cost row — deleted.
 *   Records that belong to something else and only POINT at the load are KEPT and unlinked: docs.files (2),
 *     fuel.tank_events (1), downtime.events.following_load_id (1).
 *   load 90007: deleted.
 * Refuses unless the live rows equal the measured ones. One transaction, one audit row.
 *
 * Run: DATABASE_URL=<url> npx tsx scripts/ops/2026-10-01-cc2-auth196-delete-duplicate-load-90007.ts [--rehearse | --apply]
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { assertIsIntendedProduction } from "../../../scripts/lib/assert-not-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const APPLY = process.argv.includes("--apply");
const REHEARSE = !APPLY && process.argv.includes("--rehearse");
const AUTH_ID = "AUTH-197";
const ACTOR = "00000000-0000-4000-8000-000000000001";
const LOAD = "f465285d-fe9a-4b24-bcd7-e5a03cdadc9e";
const INVOICE = "bba8411e-909e-4f1d-af21-1729a25a1ae7";
const JES = ["1ae2e78a-fa5d-4319-a1b6-d4cf754aae98", "d324689e-03db-4fda-a754-6cf117760076"];
const REASON = "AUTH-197: owner ruling 2026-10-01 -- load/invoice 90007 (Faro 7, ITS Logistics $350) is a duplicate; deleted, recreate through the engine if found real";

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
  const c = new pg.Client({ connectionString: url, statement_timeout: 60000 });
  await c.connect();
  const step = async (label: string, sql: string, params: unknown[]) => {
    const r = await c.query(sql, params);
    console.log(`  ${label}: ${r.rowCount ?? 0}`);
    return r.rowCount ?? 0;
  };
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL lock_timeout = '5s'");
    if (APPLY) await assertIsIntendedProduction(c);
    await c.query("SET LOCAL ROLE neondb_owner");
    await c.query("SET LOCAL app.bypass_rls = 'lucia'");
    const before = (await c.query<Record<string, unknown>>(
      `SELECT (SELECT load_number FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $3::uuid) AS load_number,
              (SELECT display_id || ':' || total_cents FROM accounting.invoices WHERE id = $2::uuid AND operating_company_id = $3::uuid) AS invoice,
              (SELECT count(*)::int FROM accounting.journal_entries WHERE id = ANY($4::uuid[]) AND status = 'posted' AND reversed_by_je_id IS NULL) AS jes,
              (SELECT count(*)::int FROM accounting.journal_entries je JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid = je.id
                WHERE p.source_transaction_id::text IN ($1::text, $2::text) AND NOT (je.id = ANY($4::uuid[]))) AS other_jes,
              (SELECT count(*)::int FROM accounting.payment_applications WHERE invoice_id = $2::uuid) AS payments`,
      [LOAD, INVOICE, USMCA, JES]
    )).rows[0]!;
    console.log("before:", before);
    const probs: string[] = [];
    if (before.load_number !== "90007") probs.push("load 90007 not found");
    if (before.invoice !== "90007:35000") probs.push(`invoice is ${before.invoice}`);
    if (before.jes !== 2) probs.push(`expected 2 live JEs, found ${before.jes}`);
    if (before.other_jes !== 0) probs.push(`${before.other_jes} other JE postings reference the load/invoice`);
    if (before.payments !== 0) probs.push("invoice has payment applications");
    if (probs.length) {
      await c.query("ROLLBACK");
      console.error(`REFUSED: ${probs.join("; ")}`);
      process.exit(1);
    }
    if (!APPLY && !REHEARSE) {
      await c.query("ROLLBACK");
      console.log("DRY RUN: nothing written. --rehearse (rolled back) or --apply under AUTH-197.");
      return;
    }
    await c.query(`SELECT set_config('app.purge_auth_id', $1, true)`, [AUTH_ID]);
    await step("transaction_source_links", `DELETE FROM accounting.transaction_source_links WHERE operating_company_id = $4::uuid AND (linked_object_id::text IN ($1, $2)
       OR journal_entry_posting_id IN (SELECT id FROM accounting.journal_entry_postings WHERE journal_entry_uuid = ANY($3::uuid[])))`, [LOAD, INVOICE, JES, USMCA]);
    await step("revrec latch rows", `DELETE FROM accounting.load_revenue_recognition_postings WHERE load_id = $1::uuid AND operating_company_id = $2::uuid`, [LOAD, USMCA]);
    await step("postings", `DELETE FROM accounting.journal_entry_postings WHERE journal_entry_uuid = ANY($1::uuid[]) AND operating_company_id = $2::uuid`, [JES, USMCA]);
    await step("JEs void-stamped", `UPDATE accounting.journal_entries SET voided_at = now(), voided_by_user_id = $2::uuid, void_reason = $3 WHERE id = ANY($1::uuid[]) AND operating_company_id = $4::uuid`, [JES, ACTOR, REASON, USMCA]);
    await step("JEs deleted", `DELETE FROM accounting.journal_entries WHERE id = ANY($1::uuid[]) AND operating_company_id = $2::uuid`, [JES, USMCA]);
    await step("invoice void-stamped", `UPDATE accounting.invoices SET status = 'void', voided_at = now(), voided_by_user_id = $2::uuid, void_reason = $3 WHERE id = $1::uuid AND operating_company_id = $4::uuid`, [INVOICE, ACTOR, REASON, USMCA]);
    await step("invoice lines", `DELETE FROM accounting.invoice_lines WHERE operating_company_id = $3::uuid AND (invoice_id = $1::uuid OR source_load_id = $2::uuid)`, [INVOICE, LOAD, USMCA]);
    await step("invoice deleted", `DELETE FROM accounting.invoices WHERE id = $1::uuid AND operating_company_id = $2::uuid`, [INVOICE, USMCA]);
    await step("docs.files unlinked (kept)", `UPDATE docs.files SET dispatch_load_id = NULL WHERE dispatch_load_id = $1::uuid AND operating_company_id = $2::uuid`, [LOAD, USMCA]);
    await step("fuel.tank_events unlinked (kept)", `UPDATE fuel.tank_events SET load_id = NULL WHERE load_id = $1::uuid AND operating_company_id = $2::uuid`, [LOAD, USMCA]);
    await step("downtime.events unlinked (kept)", `UPDATE downtime.events SET following_load_id = NULL WHERE following_load_id = $1::uuid AND operating_company_id = $2::uuid`, [LOAD, USMCA]);
    await step("fuel.load_fuel_cost", `DELETE FROM fuel.load_fuel_cost WHERE load_id = $1::uuid AND operating_company_id = $2::uuid`, [LOAD, USMCA]);
    await step("load_charge_lines", `DELETE FROM dispatch.load_charge_lines WHERE load_id = $1::uuid AND operating_company_id = $2::uuid`, [LOAD, USMCA]);
    await step("load_cancellations", `DELETE FROM dispatch.load_cancellations WHERE load_id = $1::uuid AND operating_company_id = $2::uuid`, [LOAD, USMCA]);
    await step("load_assignment_history", `DELETE FROM dispatch.load_assignment_history WHERE load_id = $1::uuid AND operating_company_id = $2::uuid`, [LOAD, USMCA]);
    await step("load_stops", `DELETE FROM mdata.load_stops WHERE load_id = $1::uuid AND EXISTS (SELECT 1 FROM mdata.loads l WHERE l.id = $1::uuid AND l.operating_company_id = $2::uuid)`, [LOAD, USMCA]);
    await step("load deleted", `DELETE FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid`, [LOAD, USMCA]);
    const after = (await c.query(`SELECT (SELECT count(*)::int FROM mdata.loads WHERE id = $1::uuid) l, (SELECT count(*)::int FROM accounting.invoices WHERE id = $2::uuid) i,
      (SELECT count(*)::int FROM accounting.journal_entries WHERE id = ANY($3::uuid[])) j`, [LOAD, INVOICE, JES])).rows[0];
    console.log("after:", after);
    if (REHEARSE) {
      await c.query("ROLLBACK");
      console.log("REHEARSAL complete, rolled back — nothing written.");
      return;
    }
    await c.query(`SELECT audit.append_event($1, $2, $3::jsonb, $4::uuid, $5)`, [
      "dispatch.duplicate_load_deleted", "warning",
      JSON.stringify({ auth: AUTH_ID, operating_company_id: USMCA, load_id: LOAD, load_number: "90007", invoice_id: INVOICE, invoice_display_id: "90007",
        amount_cents: 35000, journal_entry_ids: JES, reason: REASON }),
      ACTOR, `CC-2-${AUTH_ID}`,
    ]);
    await c.query("COMMIT");
    console.log(`APPLIED under ${AUTH_ID}: load 90007, invoice 90007 and its 2 JEs deleted; 1 audit row.`);
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await c.end();
  }
}

await main();
