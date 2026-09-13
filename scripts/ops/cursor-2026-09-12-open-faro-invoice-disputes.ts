#!/usr/bin/env tsx
/**
 * Open the two source-confirmed A/R invoice disputes discovered reconciling factoring to Faro's own
 * USMCA export (docs/reconcile/faro_canonical_purchases.csv, src=export (18).csv). OWNER RULING
 * 2026-09-12: keep the invoice at the INVOICED amount and open a dispute for the delta so the A/R
 * balance stays OPEN and we can figure/fix (edit for a mis-entry, or a credit memo for a real
 * discount/fine). This posts NO GL — it is a tracking record through the new invoice-dispute API.
 *
 *   Load 13581 Triple T Transport : invoiced $4,900.00  Faro purchased $3,300.00 (inv 063, 09/11) -> $1,600 dispute
 *   Load 13586 Mode Transportation: invoiced $3,600.00  Faro purchased $3,300.00 (inv 066, 09/11) -> $300 dispute
 *
 * Usage: DATABASE_URL=<Neon USMCA> npx tsx scripts/ops/cursor-2026-09-12-open-faro-invoice-disputes.ts [--apply]
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

const TARGETS: Target[] = [
  {
    invoice_id: "000e7dba-cc70-4ebb-941f-f4e8255c4283",
    load: "13581",
    customer: "Triple T Transport, INC",
    invoiced_cents: 490000,
    faro_purchase_cents: 330000,
    faro_inv: "063",
    faro_date: "09/11/2026",
  },
  {
    invoice_id: "0f96c60b-bd8c-4023-8d35-6818057cebf1",
    load: "13586",
    customer: "Mode Transportation",
    invoiced_cents: 360000,
    faro_purchase_cents: 330000,
    faro_inv: "066",
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
      console.log(
        `pre-flight OK  load ${t.load}  inv ${row.display_id}  status=${row.status}  face=$${(Number(row.total_cents) / 100).toFixed(2)}  Faro=$${(t.faro_purchase_cents / 100).toFixed(2)}  gap=$${((t.invoiced_cents - t.faro_purchase_cents) / 100).toFixed(2)}`
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
    const gap = t.invoiced_cents - t.faro_purchase_cents;
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/invoices/${t.invoice_id}/disputes`,
      headers,
      payload: {
        operating_company_id: USMCA_COMPANY_ID,
        disputed_amount_cents: gap,
        expected_amount_cents: t.faro_purchase_cents,
        reason_code: "short_pay",
        reason_text:
          `Factoring reconciliation to Faro's own USMCA export: we invoiced $${(t.invoiced_cents / 100).toFixed(2)} to ${t.customer} (load ${t.load}) ` +
          `but Faro purchased $${(t.faro_purchase_cents / 100).toFixed(2)} (Faro inv ${t.faro_inv}, ${t.faro_date}). ` +
          `Balance kept OPEN for the $${(gap / 100).toFixed(2)} delta — figure & fix: edit the invoice if we entered it wrong, or a credit memo if the customer took a real deduction (late discount / driver-no-answer fine).`,
      },
    });
    if (res.statusCode >= 300) {
      console.error(`FAIL open dispute load ${t.load} :: ${res.statusCode} :: ${res.body}`);
      await app.close();
      await pool.end();
      process.exitCode = 1;
      return;
    }
    const body = JSON.parse(res.body) as { dispute: { id: string; disputed_amount_cents: number } };
    console.log(
      `DONE dispute load ${t.load} :: ${body.dispute.id} :: $${(body.dispute.disputed_amount_cents / 100).toFixed(2)} open (invoice untouched at $${(t.invoiced_cents / 100).toFixed(2)})`
    );
  }

  await app.close();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
