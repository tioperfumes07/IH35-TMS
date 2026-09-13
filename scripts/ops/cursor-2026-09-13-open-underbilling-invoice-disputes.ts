#!/usr/bin/env tsx
/**
 * Open the two source-confirmed A/R UNDER-BILLING invoice disputes found reconciling factoring to Faro's
 * own USMCA export (docs/reconcile/faro_canonical_purchases.csv). OWNER RULING 2026-09-13: "when there is
 * an over payment or underpayment, it must also go to dispute, so we can know there is or was an issue with
 * a load." These are the OTHER direction from short-pay: Faro PURCHASED MORE than we invoiced, i.e. we
 * under-billed. Keep the invoice at its billed face (A/R stays open); the dispute is a NO-GL tracking record
 * of the variance. Resolution is the owner money workflow (invoice_corrected = raise the invoice).
 *
 *   Load 13578 Refrigerx Transportation LLC : invoiced $4,650.00  Faro purchased $5,210.00 (inv 059, 09/08) -> $560 under-billing
 *   Load 13589 Kirsch Transportation Services INC: invoiced $4,120.00  Faro purchased $4,150.00 (inv 069, 09/11) -> $30 under-billing
 *
 * Reason code = mis_entry (owner: "maybe we entered the amount incorrectly, well we edit"). The
 * `under_billing` reason code + validation relax is a seat task (PART C.11); mis_entry is the correct
 * existing code and disputed ($560/$30) is well under the invoice face, so this opens cleanly today.
 *
 * Usage: DATABASE_URL=<Neon USMCA> npx tsx scripts/ops/cursor-2026-09-13-open-underbilling-invoice-disputes.ts [--apply]
 */
import pg from "pg";
import { createIntegrationApp } from "../../apps/backend/test-helpers/http-app.js";
import invoiceDisputesPlugin from "../../apps/backend/src/accounting/invoice-disputes.routes.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const apply = process.argv.includes("--apply");

type Target = {
  invoice_id: string;
  load: string;
  customer: string;
  invoiced_cents: number;
  faro_purchase_cents: number;
  faro_inv: string;
  faro_date: string;
};

// Both amounts verified against Faro's own USMCA export (canonical) + the live invoice face.
const TARGETS: Target[] = [
  {
    invoice_id: "badebb25-2a52-4f17-abe5-b401ca203d4d",
    load: "13578",
    customer: "Refrigerx Transportation LLC",
    invoiced_cents: 465000,
    faro_purchase_cents: 521000,
    faro_inv: "059",
    faro_date: "09/08/2026",
  },
  {
    invoice_id: "3aa2c960-d6ef-4b6c-ae44-f0f7e7e323ba",
    load: "13589",
    customer: "Kirsch Transportation Services INC",
    invoiced_cents: 412000,
    faro_purchase_cents: 415000,
    faro_inv: "069",
    faro_date: "09/11/2026",
  },
];

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

  // Pre-flight: confirm each invoice is real, sent, and still at the invoiced face (no guessing).
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
    for (const t of TARGETS) {
      const r = await client.query(
        `SELECT display_id, status::text, total_cents::text FROM accounting.invoices
          WHERE id=$1 AND operating_company_id=$2`,
        [t.invoice_id, USMCA_COMPANY_ID]
      );
      const row = r.rows[0];
      if (!row) throw new Error(`invoice ${t.invoice_id} (load ${t.load}) not found`);
      if (row.status !== "sent") throw new Error(`invoice load ${t.load} not 'sent' (${row.status})`);
      if (Number(row.total_cents) !== t.invoiced_cents)
        throw new Error(`invoice load ${t.load} face ${row.total_cents} != expected ${t.invoiced_cents}`);
      const gap = t.faro_purchase_cents - t.invoiced_cents; // positive = under-billing
      console.log(
        `pre-flight OK  load ${t.load}  inv ${row.display_id}  status=${row.status}  face=$${(Number(row.total_cents) / 100).toFixed(2)}  Faro=$${(t.faro_purchase_cents / 100).toFixed(2)}  under-billing=+$${(gap / 100).toFixed(2)}`
      );
    }
    await client.query("ROLLBACK");
  } finally {
    client.release();
  }

  if (!apply) {
    console.log("DRY-RUN — zero writes. Re-run with --apply to open the disputes through the API.");
    await pool.end();
    return;
  }

  process.env.IH35_TEST_AUTH_BYPASS = "1";
  const app = await createIntegrationApp(async (a) => {
    await (invoiceDisputesPlugin as any)(a);
  });
  const headers = {
    "x-test-auth": Buffer.from(
      JSON.stringify({ id: OWNER_USER_ID, role: "Owner", email: "tioperfumes07@gmail.com" }),
      "utf8"
    ).toString("base64url"),
    "content-type": "application/json",
  };

  for (const t of TARGETS) {
    const gap = t.faro_purchase_cents - t.invoiced_cents; // under-billing delta (>0)
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/invoices/${t.invoice_id}/disputes`,
      headers,
      payload: {
        operating_company_id: USMCA_COMPANY_ID,
        disputed_amount_cents: gap,
        expected_amount_cents: t.faro_purchase_cents,
        reason_code: "mis_entry",
        reason_text:
          `UNDER-BILLING (owner ruling 2026-09-13: over/under-payment both open a dispute). ` +
          `We invoiced $${(t.invoiced_cents / 100).toFixed(2)} to ${t.customer} (load ${t.load}) but Faro purchased ` +
          `$${(t.faro_purchase_cents / 100).toFixed(2)} (Faro inv ${t.faro_inv}, ${t.faro_date}). ` +
          `Invoice kept at billed face; A/R stays OPEN for the +$${(gap / 100).toFixed(2)} we under-billed. ` +
          `Figure & fix: raise the invoice (invoice_corrected) — owner money workflow.`,
      },
    });
    if (res.statusCode >= 300) {
      console.error(`FAIL open dispute load ${t.load} :: ${res.statusCode} :: ${res.body}`);
      await app.close();
      await pool.end();
      process.exitCode = 1;
      return;
    }
    const body = JSON.parse(res.body) as {
      dispute: { id: string; disputed_amount_cents: number; expected_amount_cents: number; invoiced_amount_cents: number };
    };
    console.log(
      `DONE dispute load ${t.load} :: ${body.dispute.id} :: under-billing +$${(body.dispute.disputed_amount_cents / 100).toFixed(2)} ` +
        `(invoiced $${(body.dispute.invoiced_amount_cents / 100).toFixed(2)} untouched, expected $${(body.dispute.expected_amount_cents / 100).toFixed(2)})`
    );
  }

  await app.close();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
