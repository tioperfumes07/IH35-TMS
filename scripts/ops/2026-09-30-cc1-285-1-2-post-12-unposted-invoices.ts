/**
 * DEFECT 285.1.2 (280.2, Lead order 2026-09-30): "Post the 12 invoices that never hit the GL.
 * $52,960.00. Post by DOCUMENT, never a JE."
 *
 * ROOT CAUSE (live-verified, USMCA, bypass_rls): 27 non-voided invoices carry NO live
 * journal_entry_postings row (source_transaction_type='invoice'). Of those, 12 are status='sent'
 * (a real, issued A/R obligation) and sum to EXACTLY $52,960.00: 13625/13616/13621/13503(INV-
 * 2026-00001)/13504(INV-2026-00002)/13539(INV-2026-00005)/13509(INV-2026-00003)/13620/13618/
 * 13533(INV-2026-00004)/13626/13622. Five of the twelve (13618, 13620, 13622, 13625, 13626)
 * already carry a live Faro factoring_advance -- confirmed by direct join, matching the order's
 * own count exactly. The remaining 15 of the 27 are status='proforma' (not yet issued, correctly
 * unposted -- several of them, 13624/13636/13637/13638/13639, are the Transportation-owned block
 * from the withdrawn 280.4 investigation and are excluded here on that basis too, redundantly).
 *
 * 13525 ($0.00, status='sent') is DELIBERATELY EXCLUDED from this batch, not one of "the 12":
 * its own load (mdata.loads, load_number 13525) carries rate_total_cents=0 -- a real, zero-rate
 * load, not a data-entry error on the invoice side. Its single invoice_lines row correctly mirrors
 * that at $0. Posting a $0 invoice is a no-op with zero GL effect either way; left out rather than
 * invented a reason to post nothing.
 *
 * FIX: calls postInvoiceGlIfEnabled -- the SAME sanctioned "post by document" function
 * invoice-send.service.ts's sendDraftInvoice and invoices-bulk.routes.ts's own bulk status-change
 * path both already call for an issued invoice. No new GL math, no manual journal entry anywhere.
 * The function is itself idempotent (per-invoice idempotency key) and already refuses to double-
 * post a load whose revenue was posted via the two-event delivery latch (ACCT-F205) -- both
 * safety properties are the poster's own, not reimplemented here.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID;
if (!REQUIRED_AUTH_ID) {
  console.error("ROUND 133 P0: OWNER_AUTH_ID env var is required; refusing a production financial write without an OPEN authorization on main.");
  process.exit(1);
}
try {
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), REQUIRED_AUTH_ID], { stdio: "inherit" });
} catch {
  console.error(`ROUND 133 P0: ${REQUIRED_AUTH_ID} rejected -- see docs/bus/OWNER-AUTHORIZATIONS.md.`);
  process.exit(1);
}

const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SYSTEM_ACTOR_USER_ID = "00000000-0000-4000-8000-000000000001";

const INVOICE_IDS: Array<{ id: string; display_id: string; cents: number }> = [
  { id: "efb40666-aa53-4c00-89a0-bb63ed3aef87", display_id: "13625", cents: 625000 },
  { id: "19a81beb-aae8-424d-ba1f-4a8dbbfc0182", display_id: "13616", cents: 570000 },
  { id: "708ffeac-db57-4218-b343-bce97f5b0fa6", display_id: "13621", cents: 490000 },
  { id: "e1ed335c-4d83-42e7-8da0-4b60c6674150", display_id: "INV-2026-00001", cents: 490000 },
  { id: "e7e70b12-93a7-4ae4-9e09-cf9ee17235e1", display_id: "INV-2026-00002", cents: 490000 },
  { id: "53d1270b-7121-45f9-962f-5863605e5a2d", display_id: "INV-2026-00005", cents: 486000 },
  { id: "2c8e69b0-7163-4190-a245-a7ee1fca6032", display_id: "INV-2026-00003", cents: 440000 },
  { id: "55e45834-cab4-4bb9-970d-8551a05687c2", display_id: "13620", cents: 430000 },
  { id: "bcf369a7-9672-4b7d-b41e-ca10c5ea20d7", display_id: "13618", cents: 370000 },
  { id: "0764fee9-df4a-41d7-8eff-7bf0f3b7412b", display_id: "INV-2026-00004", cents: 345000 },
  { id: "066eacf5-b14b-4747-9bc0-475a853a4539", display_id: "13626", cents: 340000 },
  { id: "5c781bac-9eb2-4a5d-9684-c72d883570df", display_id: "13622", cents: 220000 },
];

async function main() {
  if (INVOICE_IDS.length !== 12) throw new Error(`expected 12 invoice ids, got ${INVOICE_IDS.length}`);
  const totalCents = INVOICE_IDS.reduce((s, x) => s + x.cents, 0);
  if (totalCents !== 5296000) throw new Error(`expected total 5296000 cents ($52,960.00), got ${totalCents}`);

  const { postInvoiceGlIfEnabled } = await import("../../apps/backend/src/accounting/invoice-gl.service.js");
  const { appendCrudAudit } = await import("../../apps/backend/src/audit/crud-audit.js");

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  const results: Array<Record<string, unknown>> = [];
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA_ID]);

    // Pre-flight: re-verify every invoice is still live, status='sent', total matches, and still
    // has no live posting -- immediately before touching anything.
    const pre = await client.query<{ id: string; status: string; total_cents: string; has_live_posting: boolean }>(
      `SELECT i.id::text, i.status, i.total_cents::text,
              EXISTS (
                SELECT 1 FROM accounting.journal_entry_postings jep
                JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
                WHERE jep.source_transaction_type = 'invoice' AND jep.source_transaction_id = i.id::text
                  AND je.status = 'posted' AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL
              ) AS has_live_posting
         FROM accounting.invoices i
        WHERE i.id = ANY($1::uuid[]) AND i.operating_company_id = $2::uuid AND i.voided_at IS NULL`,
      [INVOICE_IDS.map((x) => x.id), USMCA_ID]
    );
    if (pre.rows.length !== 12) throw new Error(`preflight: expected 12 live invoices, found ${pre.rows.length}`);
    for (const row of pre.rows) {
      const want = INVOICE_IDS.find((x) => x.id === row.id)!;
      if (row.status !== "sent") throw new Error(`preflight: ${want.display_id} status is ${row.status}, not sent`);
      if (row.total_cents !== String(want.cents)) throw new Error(`preflight: ${want.display_id} total_cents drift: ${row.total_cents} vs expected ${want.cents}`);
      if (row.has_live_posting) throw new Error(`preflight: ${want.display_id} already has a live GL posting -- STOP`);
    }
    console.log(`PRE-FLIGHT OK: all 12 invoices live, status=sent, totals match, no live posting.`);

    for (const inv of INVOICE_IDS) {
      const outcome = await postInvoiceGlIfEnabled(client as never, USMCA_ID, inv.id, { userId: SYSTEM_ACTOR_USER_ID });
      console.log(`${inv.display_id}: ${JSON.stringify(outcome)}`);
      results.push({ display_id: inv.display_id, invoice_id: inv.id, ...outcome });
      if (!outcome.posted) {
        await appendCrudAudit(
          client,
          SYSTEM_ACTOR_USER_ID,
          "accounting.invoice.gl_post_failed",
          { resource_type: "accounting.invoices", resource_id: inv.id, operating_company_id: USMCA_ID, outcome, round: "285.1.2" },
          "warning",
          "ACCT-285-1-2"
        );
      }
    }

    const after1100 = await client.query<{ net: string }>(
      `SELECT sum(CASE WHEN jep.debit_or_credit='debit' THEN jep.amount_cents ELSE -jep.amount_cents END)::text AS net
         FROM accounting.journal_entry_postings jep
         JOIN accounting.journal_entries je ON je.id=jep.journal_entry_uuid
         JOIN catalogs.accounts a ON a.id=jep.account_id
        WHERE je.operating_company_id=$1::uuid AND a.account_number='1100'
          AND je.status='posted' AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL`,
      [USMCA_ID]
    );
    console.log("AFTER -- 1100 net (cents):", after1100.rows[0]?.net);

    const tb = await client.query<{ debit_total: string; credit_total: string }>(
      `SELECT sum(CASE WHEN jep.debit_or_credit='debit' THEN jep.amount_cents ELSE 0 END)::text AS debit_total,
              sum(CASE WHEN jep.debit_or_credit='credit' THEN jep.amount_cents ELSE 0 END)::text AS credit_total
         FROM accounting.journal_entry_postings jep
         JOIN accounting.journal_entries je ON je.id=jep.journal_entry_uuid
        WHERE je.operating_company_id=$1::uuid AND je.status='posted' AND je.voided_at IS NULL`,
      [USMCA_ID]
    );
    console.log("TRIAL BALANCE (all posted, live+historical-reversed both counted, debit vs credit):", JSON.stringify(tb.rows[0]));

    if (process.env.DRY_RUN === "1") {
      console.log("DRY_RUN=1 -- rolling back, nothing committed.");
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
      console.log("COMMITTED.");
    }
    console.log(JSON.stringify(results, null, 2));
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("FAILED, rolled back:", (err as Error).message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
