/**
 * AUTH-148 — record invoice 010 (SUPPLY CHAIN MANAGEMENT, $4,000.00), a genuinely load-less
 * self-carried invoice the customer already holds. Backfilling an ISSUED paper document, not
 * issuing new paper (Lead ruling, ROUND 290): "sendDraftInvoice['s live_feed path] is wrong ...
 * Use historical_backfill with the PDF as the named evidence source."
 *
 * SOURCE (owner's own signed PDF, read directly):
 *   ~/Downloads/Invoice 010 SUPPLY CHAIN MANAGEMENT.pdf (same file also under
 *   IH35-MASTER-RECONCILIATION/05-INVOICES-SELF-CARRIED/) -- USMCA Freight Solutions, Inc. letterhead,
 *   Bill To / Ship To "SUPPLY CHAIN MANAGEMENT, 500-A Morgan Lakes Indutrial Blvd, Savannah, GA 31407",
 *   Invoice #010, Date 08/13/2026, Due 08/14/2026, Terms "1 Day Quick Pay",
 *   "Sales of Service Income:Line Haul / Load Number - 010", qty 1, rate $4,000.00, Balance Due $4,000.00.
 *
 * ROOT CAUSE (Lead order, fixed separately in this same PR): "Load Number - 010" on the PDF is the
 * INVOICE's own number, not a real TMS load reference -- whoever built the PDF template typed the
 * invoice number into the load-number line. Confirmed live: no mdata.loads row, and no AlwaysTrack
 * export row anywhere under IH35-MASTER-RECONCILIATION, exists for "Supply Chain Management" +
 * 08/13/2026 + $4,000 -- this is a genuinely load-less document, not a missing-load defect.
 *
 * CUSTOMER: mdata.customers id 4fa300b3-45b6-4eef-a484-1c3fe065ad72 ("SUPPLY CHAIN MANAGEMENT",
 * source_system='tms', operating_company_id=USMCA). CORRECTED during Neon-branch rehearsal: a
 * same-named QBO-sourced record (296fd87b-fc93-48e0-9503-d27772c14cf7, qbo_customer_id='648')
 * looked more "canonical" by source/usage, but its operating_company_id is TRANSPORTATION
 * (91e0bf0a-133f-4ce8-a734-2586cfa66d96), a DIFFERENT entity -- using it would have been a
 * cross-entity write. A third same-named record (dd60e618-..., "SUPPLY CHAIN MANAGEMENT LLC")
 * belongs to TRK. Entity scope, not source/usage recency, is the decisive discriminator here.
 * 4fa300b3's zero prior usage is simply because this invoice is its first, not evidence of being
 * wrong.
 *
 * WRITER -- the real invoice engine, not a reimplementation:
 *   1. accounting.invoices INSERT, same columns/shape as invoices.routes.ts POST /invoices
 *      (source_load_id NULL -- this document is genuinely load-less).
 *   2. accounting.invoice_lines INSERT via the real resolveInvoiceLineRevenueAccountId({line_type:
 *      "other"}) + invoiceLineTotalCents (assertLoadRevenueHasSourceLoad only permits "other"/
 *      "adjustment" line types on a load-less invoice), then the real recomputeInvoiceTotals.
 *   3. The real sendDraftInvoice, mode: "historical_backfill", manualEvidence: { source:
 *      "owner_source_document", documentRef: "Invoice 010 SUPPLY CHAIN MANAGEMENT.pdf" } -- the
 *      new, narrowly-scoped evidence class added in this same PR (invoice-send.service.ts). This
 *      does NOT weaken or bypass the gate: it requires historical_backfill mode AND an explicit
 *      named document, and only fires for the no_source_load shape.
 *
 * Idempotent: skips if a live (non-voided) invoice with display_id "010" already exists for this
 * customer.
 *
 * AUTHORIZATION: OWNER_AUTH_ID=AUTH-148, docs/bus/OWNER-AUTHORIZATIONS.md, verified via
 * scripts/verify-owner-authorization.mjs (run from repo root).
 *
 * USAGE
 *   DRY_RUN=1 DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-30-cc1-auth147-invoice-010-supply-chain.ts
 *   OWNER_AUTH_ID=AUTH-148 DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-30-cc1-auth147-invoice-010-supply-chain.ts
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { assertNotProduction, assertIsIntendedProduction } from "../lib/assert-not-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID;
const DRY_RUN = process.env.DRY_RUN === "1";

if (!DRY_RUN) {
  if (!REQUIRED_AUTH_ID) {
    console.error("ROUND 133 P0: OWNER_AUTH_ID env var is required for a real write; refusing a production financial write without an OPEN authorization on main.");
    process.exit(1);
  }
  try {
    execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), REQUIRED_AUTH_ID], { stdio: "inherit" });
  } catch {
    console.error(`ROUND 133 P0: ${REQUIRED_AUTH_ID} rejected -- see docs/bus/OWNER-AUTHORIZATIONS.md.`);
    process.exit(1);
  }
}

const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SYSTEM_ACTOR_USER_ID = "00000000-0000-4000-8000-000000000001";
const CUSTOMER_ID = "4fa300b3-45b6-4eef-a484-1c3fe065ad72";
const DISPLAY_ID = "010";
const AMOUNT_CENTS = 400000;
const ISSUE_DATE = "2026-08-13";
const DUE_DATE = "2026-08-14";
const DESCRIPTION = "Sales of Service Income: Line Haul -- self-carried, Invoice 010 (Faro never purchased)";

async function main() {
  const { resolveInvoiceLineRevenueAccountId } = await import(
    "../../apps/backend/src/invoices/invoice-line-revenue-resolution.service.js"
  );
  const { invoiceLineTotalCents } = await import("../../apps/backend/src/accounting/invoice-line-total.js");
  const { recomputeInvoiceTotals } = await import("../../apps/backend/src/accounting/shared.js");
  const { sendDraftInvoice } = await import("../../apps/backend/src/accounting/invoice-send.service.js");

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  await (process.env.OWNER_AUTH_ID ? assertIsIntendedProduction : assertNotProduction)(client, { label: "scripts/ops/2026-09-30-cc1-auth147-invoice-010-supply-chain.ts" });
  try {
    await client.query("BEGIN");
    await client.query("RESET ROLE");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA_ID]);

    const existing = await client.query<{ id: string }>(
      `SELECT id::text FROM accounting.invoices WHERE operating_company_id = $1::uuid AND display_id = $2 AND voided_at IS NULL LIMIT 1`,
      [USMCA_ID, DISPLAY_ID]
    );
    if (existing.rows[0]) {
      console.log(`SKIP (already exists) display_id=${DISPLAY_ID} invoice_id=${existing.rows[0].id}`);
      await client.query("ROLLBACK");
      return;
    }

    const customerRes = await client.query<{ id: string; payment_terms_id: string | null; ar_email: string | null; ar_phone: string | null; is_sample_data: boolean }>(
      `SELECT id::text, payment_terms_id::text, ar_email, ar_phone, is_sample_data FROM mdata.customers WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
      [CUSTOMER_ID, USMCA_ID]
    );
    const customer = customerRes.rows[0];
    if (!customer) throw new Error(`customer_id ${CUSTOMER_ID} not found live -- STOP`);

    const invoiceRes = await client.query<{ id: string }>(
      `INSERT INTO accounting.invoices (
         operating_company_id, customer_id, display_id, status, issue_date, due_date,
         payment_terms_id, payment_terms_label, payment_terms_days, ar_email_snapshot, ar_phone_snapshot,
         internal_notes, customer_notes, currency_code, created_by_user_id, updated_by_user_id,
         source_load_id, is_sample_data
       ) VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11,$12,'USD',$13,$13,NULL,$14)
       RETURNING id::text`,
      [
        USMCA_ID,
        CUSTOMER_ID,
        DISPLAY_ID,
        ISSUE_DATE,
        DUE_DATE,
        customer.payment_terms_id,
        "1 Day Quick Pay",
        1,
        customer.ar_email,
        customer.ar_phone,
        "AUTH-148 -- self-carried invoice, never a Faro purchase, genuinely load-less. Source: Invoice 010 SUPPLY CHAIN MANAGEMENT.pdf. \"Load Number - 010\" on the PDF is the invoice's own number, not a TMS load reference.",
        null,
        SYSTEM_ACTOR_USER_ID,
        Boolean(customer.is_sample_data),
      ]
    );
    const invoiceId = invoiceRes.rows[0]?.id;
    if (!invoiceId) throw new Error("invoice insert failed -- STOP");

    const revenueResolution = await resolveInvoiceLineRevenueAccountId(USMCA_ID, { line_type: "other" });
    const lineTotal = invoiceLineTotalCents(1, AMOUNT_CENTS);
    await client.query(
      `INSERT INTO accounting.invoice_lines (
         operating_company_id, invoice_id, source_load_id, line_type, revenue_code, account_id,
         description, quantity, unit_amount_cents, line_total_cents, display_order
       ) VALUES ($1,$2,NULL,'other',$3,$4,$5,1,$6,$7,0)`,
      [USMCA_ID, invoiceId, revenueResolution.revenue_code, revenueResolution.account_id, DESCRIPTION, AMOUNT_CENTS, lineTotal]
    );
    await recomputeInvoiceTotals(client, invoiceId);

    const sendResult = await sendDraftInvoice(client, {
      invoiceId,
      operatingCompanyId: USMCA_ID,
      userId: SYSTEM_ACTOR_USER_ID,
      mode: "historical_backfill",
      manualEvidence: { source: "owner_source_document", documentRef: "Invoice 010 SUPPLY CHAIN MANAGEMENT.pdf" },
    });
    if (!sendResult.ok) {
      throw new Error(`sendDraftInvoice failed: ${sendResult.code} ${sendResult.error} ${("message" in sendResult && sendResult.message) || ""}`);
    }

    const result = { display_id: DISPLAY_ID, invoice_id: invoiceId, amount_cents: AMOUNT_CENTS, status: "created_and_sent" };
    console.log(JSON.stringify(result, null, 2));

    if (DRY_RUN) {
      console.log("DRY_RUN=1 -- rolling back, nothing committed.");
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
      console.log("COMMITTED.");
    }
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
