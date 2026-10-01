/**
 * AUTH-196 — Lead ruling 2026-10-01 16:45Z item 2 (13626 / 13637): "transition both loads to delivered through the
 * canonical status transition citing the geofence delivery-exit evidence ... exactly what auto-status would have done —
 * then run the from-load invoice engine on both, send (the gate + A/R post must pass) ... If the canonical transition
 * refuses, paste the refusal text; do not bypass."
 *
 * STATE 2026-10-01 16:41:10Z: CC-3's geofence auto-delivery (#23821, proof #23824) already moved both loads to
 * delivered_pending_docs through the canonical transition and posted Revrec Event 1 (13626 de792d44, 13637 e1e1bd7e);
 * the delivery latch audited awaiting_bol (no BOL on file), so neither has an invoice (I2 14/13).
 * This script therefore: (1) reverses the duplicate Event 1 JEs (13626 4c416f76 = CC-3's proof JE, CC-3 asks CC-2 to
 * reverse it; 13571 715378ea since 09-24) through reverseJournalEntryNoFlip; (2) issues each invoice through the
 * from-load engine: buildInvoiceFromLoad -> sendDraftInvoice (which fires Revrec Event 2, DR A/R / CR Unbilled).
 * Actor: the SYSTEM actor (app engine under AUTH-196), never the owner's identity.
 *
 * Delivery evidence (measured, CC-3 #23803): 13626 final stop actual_departure_at 2026-09-26 00:10:03Z (eld_geofence,
 * AUTH-179); 13637 2026-10-01 15:04:53Z (eld_geofence, live fence detector).
 *
 * Modes: dry run (default, read-only) | --branch (a NON-production Neon branch: runs everything, no AUTH) |
 *        --apply (production, AUTH-196 required).
 * Run: DATABASE_URL=<url> npx tsx scripts/ops/2026-10-01-cc2-auth196-revrec-duplicates-and-invoice-13626-13637.ts [--branch | --apply]
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { assertIsIntendedProduction } from "../lib/assert-not-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const APPLY = process.argv.includes("--apply");
const BRANCH = !APPLY && process.argv.includes("--branch");
const AUTH_ID = "AUTH-196";
const ACTOR = "00000000-0000-4000-8000-000000000001";
const PROD_ENDPOINT = "ep-broad-block-akykk7bw";
const LOADS = ["13626", "13637"];
// Double revenue recognition found while rehearsing (ACCT-F9616, fixed in #23828): each JE below is a posted Revrec Event 1
// with NO latch row, duplicating the load's latched Event 1. Reversed first, through the canonical reverseJournalEntryNoFlip.
const DUPLICATE_REVREC_JES = [
  { je: "4c416f76-a2a1-4000-88e2-e3fc39b3d0c4", load: "13626", cents: 340000, kept: "de792d44-97c0-44dc-a4a3-fd8c39da835d" },
  { je: "715378ea-d8d4-4315-a859-f62e91b8f09e", load: "13571", cents: 490000, kept: "86c07f57-f986-4484-be6e-22c4cd08366e" },
];

type LoadRow = { id: string; load_number: string; status: string; rate_total_cents: string; customer_id: string | null; is_sample_data: boolean; delivered_at: string | null; live_inv: number };

/** Read under a transaction-local RLS bypass (never session-scoped on the pooler). */
async function ro<T>(c: pg.Client, sql: string, params: unknown[] = []): Promise<T[]> {
  await c.query("BEGIN READ ONLY");
  try {
    await c.query("SET LOCAL app.bypass_rls = 'lucia'");
    const r = await c.query(sql, params);
    await c.query("COMMIT");
    return r.rows as T[];
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  }
}

async function readLoads(c: pg.Client): Promise<LoadRow[]> {
  return ro<LoadRow>(c, 
    `SELECT l.id::text, l.load_number, l.status::text, l.rate_total_cents::text, l.customer_id::text, l.is_sample_data,
            (SELECT s.actual_departure_at::text FROM mdata.load_stops s
              WHERE s.load_id = l.id AND s.stop_type = 'delivery'
              ORDER BY s.sequence_number DESC LIMIT 1) AS delivered_at,
            (SELECT count(*)::int FROM accounting.invoices i WHERE i.source_load_id = l.id AND i.voided_at IS NULL) AS live_inv
       FROM mdata.loads l WHERE l.operating_company_id = $1::uuid AND l.load_number = ANY($2::text[]) ORDER BY l.load_number`,
    [USMCA, LOADS]
  );
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  const isProd = url.includes(PROD_ENDPOINT);
  if (BRANCH && isProd) throw new Error("--branch refuses the production endpoint");
  if (APPLY && !isProd) throw new Error("--apply is for production only");
  if (APPLY) {
    try {
      execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), AUTH_ID], { stdio: "inherit" });
    } catch {
      console.error(`${AUTH_ID} rejected by verify-owner-authorization.mjs -- refusing --apply.`);
      process.exit(1);
    }
  }
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  if (APPLY) {
    await c.query("BEGIN");
    await assertIsIntendedProduction(c);
    await c.query("COMMIT");
  }
  const loads = await readLoads(c);
  const problems: string[] = [];
  if (loads.length !== LOADS.length) problems.push(`found ${loads.length} of ${LOADS.length} loads`);
  for (const l of loads) {
    console.log(`  before ${l.load_number}: status ${l.status}, rate $${(Number(l.rate_total_cents) / 100).toFixed(2)}, delivery exit ${l.delivered_at}, live invoices ${l.live_inv}`);
    if (l.is_sample_data) problems.push(`${l.load_number} is sample data`);
    if (!l.customer_id) problems.push(`${l.load_number} has no customer`);
    if (!(Number(l.rate_total_cents) > 0)) problems.push(`${l.load_number} has no rate`);
    if (!l.delivered_at) problems.push(`${l.load_number} has no delivery exit stamp`);
    if (l.status !== "delivered_pending_docs") problems.push(`${l.load_number} is ${l.status}, expected delivered_pending_docs (CC-3 auto-delivery #23821)`);
    if (l.live_inv !== 0) problems.push(`${l.load_number} already has a live invoice`);
  }
  if (problems.length) {
    console.error(`REFUSED: ${problems.join("; ")}`);
    await c.end();
    process.exit(1);
  }
  if (!APPLY && !BRANCH) {
    console.log("DRY RUN: nothing written. --branch (rehearsal branch) or --apply (production, AUTH-196).");
    await c.end();
    return;
  }

  // Step 1 — reverse the duplicate revenue JEs (one transaction; idempotent: an already-reversed JE returns its reversal).
  const { reverseJournalEntryNoFlip } = await import("../../apps/backend/src/accounting/journal-entries.service.js");
  const reversals: Array<Record<string, unknown>> = [];
  await c.query("BEGIN");
  try {
    await c.query("SET LOCAL app.bypass_rls = 'lucia'");
    await c.query(`SELECT set_config('app.operating_company_id', $1, true)`, [USMCA]);
    for (const d of DUPLICATE_REVREC_JES) {
      const chk = (await c.query<{ orphan: boolean; kept_latched: boolean; cents: string }>(
        `SELECT NOT EXISTS (SELECT 1 FROM accounting.load_revenue_recognition_postings r WHERE r.journal_entry_id = $1::uuid) AS orphan,
                EXISTS (SELECT 1 FROM accounting.load_revenue_recognition_postings r WHERE r.journal_entry_id = $2::uuid AND r.is_active AND r.event = 'earn') AS kept_latched,
                (SELECT sum(amount_cents)::text FROM accounting.journal_entry_postings WHERE journal_entry_uuid = $1::uuid AND debit_or_credit = 'credit') AS cents`,
        [d.je, d.kept]
      )).rows[0]!;
      if (!chk.orphan || !chk.kept_latched || Number(chk.cents) !== d.cents) {
        throw new Error(`duplicate check failed for ${d.je} (load ${d.load}): ${JSON.stringify(chk)}`);
      }
      const r = await reverseJournalEntryNoFlip(c as never, {
        operatingCompanyId: USMCA,
        journalEntryId: d.je,
        reason: `ACCT-F9616 duplicate revenue recognition: second Revrec Event 1 for load ${d.load} with no latch row (latched Event 1 is ${d.kept}); ${AUTH_ID}`,
        actorUserId: ACTOR,
      });
      console.log(`  reversed duplicate ${d.je} (load ${d.load}, $${(d.cents / 100).toFixed(2)}) -> ${r.reversal.reversal_journal_entry_id} on ${r.reversal.reversal_date}`);
      reversals.push({ duplicate_je: d.je, load: d.load, cents: d.cents, kept_je: d.kept, reversal_je: r.reversal.reversal_journal_entry_id });
    }
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  }

  const out: Array<Record<string, unknown>> = [];
  try {
    const { buildInvoiceFromLoad } = await import("../../apps/backend/src/accounting/from-load.js");
    const { sendDraftInvoice } = await import("../../apps/backend/src/accounting/invoice-send.service.js");
    const { fireRevrecLatchOnInvoiceIssued } = await import("../../apps/backend/src/accounting/revrec-delivery-posting/poster.service.js");
    for (const l of loads) {
      const inv = (await ro<{ id: string; status: string }>(c,
        `SELECT id::text, status::text FROM accounting.invoices WHERE source_load_id = $1::uuid AND voided_at IS NULL ORDER BY created_at DESC LIMIT 1`,
        [l.id]
      ))[0];
      let issuedBy = inv?.status === "sent" ? "already sent (earlier run)" : "delivery latch";
      if (!inv || inv.status === "draft" || inv.status === "proforma") {
        issuedBy = "from-load engine";
        await c.query("BEGIN");
        try {
          await c.query("SET LOCAL app.bypass_rls = 'lucia'");
          await c.query(`SELECT set_config('app.operating_company_id', $1, true)`, [USMCA]);
          let invoiceId = inv?.id;
          if (!invoiceId || inv!.status === "proforma") {
            const built = await buildInvoiceFromLoad(c as never, { userId: ACTOR, operatingCompanyId: USMCA, loadId: l.id, asProforma: false });
            invoiceId = String(built.invoice.id);
          }
          const sent = await sendDraftInvoice(c as never, { invoiceId: invoiceId!, operatingCompanyId: USMCA, userId: ACTOR });
          const sr = sent as { ok: boolean; error?: string; message?: string };
          if (!sr.ok) throw new Error(`send refused for ${l.load_number}: ${sr.error}${sr.message ? `:${sr.message}` : ""}`);
          await c.query("COMMIT");
        } catch (e) {
          await c.query("ROLLBACK");
          throw e;
        }
      }
      // Event 2 (DR A/R / CR Unbilled) — the invoice's A/R under the DISP-01 latch. Inside the route this runs after
      // the send commits (enqueueAfterCommit); this script's client is unmanaged, so the send-time fire ran before our
      // COMMIT and could not see the sent invoice. Fire it again now, after COMMIT (idempotent on the latch row).
      const sentId = (await ro<{ id: string }>(c, `SELECT id::text FROM accounting.invoices WHERE source_load_id = $1::uuid AND voided_at IS NULL AND status = 'sent' ORDER BY created_at DESC LIMIT 1`, [l.id]))[0]?.id;
      if (sentId) {
        await fireRevrecLatchOnInvoiceIssued(c, { operating_company_id: USMCA, source_load_id: l.id, actor_user_id: ACTOR, invoice_id: sentId });
      }
      const row = (await ro<Record<string, unknown>>(c,
        `SELECT i.id::text, i.display_id, i.status::text, i.total_cents::text, i.issue_date::text, i.due_date::text, i.sent_at::text,
                (SELECT count(*)::int FROM accounting.invoice_lines il WHERE il.invoice_id = i.id) AS lines,
                (SELECT string_agg(DISTINCT p.journal_entry_uuid::text, ',') FROM accounting.journal_entry_postings p
                  WHERE p.source_transaction_type = 'invoice' AND p.source_transaction_id::text = i.id::text) AS je_ids,
                (SELECT status::text FROM mdata.loads WHERE id = i.source_load_id) AS load_status
           FROM accounting.invoices i WHERE i.source_load_id = $1::uuid AND i.voided_at IS NULL ORDER BY i.created_at DESC LIMIT 1`,
        [l.id]
      ))[0]!;
      const postings = await ro<{ account_number: string; debit_or_credit: string; amount_cents: string }>(c,
        `SELECT a.account_number, p.debit_or_credit, p.amount_cents::text FROM accounting.journal_entry_postings p
           JOIN catalogs.accounts a ON a.id = p.account_id
          WHERE p.journal_entry_uuid = ANY(string_to_array($1, ',')::uuid[]) ORDER BY p.debit_or_credit DESC, a.account_number`,
        [String(row.je_ids ?? "")]
      );
      console.log(`  ${l.load_number}: load ${row.load_status} | invoice ${row.display_id} (${row.id}) ${row.status} $${(Number(row.total_cents) / 100).toFixed(2)} lines ${row.lines} issue ${row.issue_date} due ${row.due_date} | JE ${row.je_ids} | issued by ${issuedBy}`);
      for (const p of postings) console.log(`      ${p.debit_or_credit} ${p.account_number} ${(Number(p.amount_cents) / 100).toFixed(2)}`);
      if (row.status !== "sent" || !row.je_ids || Number(row.lines) < 1) throw new Error(`${l.load_number}: invoice not fully issued`);
      out.push({ load_number: l.load_number, load_id: l.id, issued_by: issuedBy, ...row });
    }
    await c.query(`SELECT audit.append_event($1, $2, $3::jsonb, $4::uuid, $5)`, [
      "dispatch.load_delivered_and_invoiced", "info",
      JSON.stringify({ auth: APPLY ? AUTH_ID : "branch-rehearsal", operating_company_id: USMCA, evidence: "eld_geofence delivery exit", duplicate_revenue_reversed: reversals, loads: out }),
      ACTOR, `CC-2-${AUTH_ID}`,
    ]);
    console.log(`${APPLY ? "APPLIED under " + AUTH_ID : "BRANCH REHEARSAL"}: ${out.length} loads delivered + invoiced; 1 audit row.`);
  } finally {
    await c.end();
  }
}

await main();
process.exit(0);
