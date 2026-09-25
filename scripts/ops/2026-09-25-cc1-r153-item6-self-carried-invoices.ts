/**
 * ROUND 153 item 6 — seed the 5 self-carried invoices Faro never purchased, so the true open total
 * ties to $12,592.40 (Lead order, R-153.7, and independently confirmed by
 * ~/Downloads/IH35-RECONCILIATION-AND-FEED/00-READ-FIRST/00-TO-THE-NEW-LEAD-FIVE-TRAPS.md PART 2).
 *
 * SOURCE (owner's own signed PDFs, read directly):
 *   ~/Downloads/IH35-MASTER-RECONCILIATION/05-INVOICES-SELF-CARRIED/
 *     Invoice 009   FLS TRANSPORTATION.pdf        -> $525.00,   08/13/2026, due 08/14/2026, no TMS load
 *     Invoice 010 SUPPLY CHAIN MANAGEMENT.pdf      -> $4,000.00, 08/13/2026, due 08/14/2026, no TMS load
 *     Invoice 026 IM SPECIALIZED.pdf                -> face $3,120.00 but the PDF's own PAYMENT line
 *         (3,032.60) nets to BALANCE DUE $87.40 -- the FIVE-TRAPS authority is explicit that "$0.00
 *         has been paid on any of them" and the true open total is $12,592.40 (525+4000+X+3180+4800 =
 *         12,592.40 only when X=87.40) -- so this invoice must be minted at its net $87.40 face,
 *         matching its own BALANCE DUE line, not the gross $3,120.00 pre-adjustment figure.
 *     Invoice 055 - 13555 2 EMS.pdf                 -> $3,180.00, load 13555 -- ALREADY LIVE, correct
 *         (source_load_id set, total_cents=318000, amount_open_cents=318000, factoring_status=
 *         not_factored). Nothing to do; not in the INVOICES array below.
 *     Invoice 074-13593 ALIGATOR.pdf                -> $4,800.00, 09/14/2026, due 09/15/2026. Searched
 *         01-ENGINES/feed_input.json's 124 AlwaysTrack-sourced load records and the settlement PDF
 *         corpus for a matching driver/unit/trailer/stops record for load 13593 -- none exists.
 *
 * BLOCKED — ALL FOUR of 009/010/026/074, not written by this file yet: confirmed live on a Neon
 * rehearsal branch before this PR (twice — once with all 4, once isolating 009/010/026 alone, same
 * result both times). The real sendDraftInvoice engine's own delivery-evidence gate
 * (INVOICE_SEND_REQUIRES_DELIVERY_EVIDENCE — confirmed live ON for USMCA in
 * lib.feature_flag_overrides, operating_company_id=USMCA, enabled=true, no expiry) refuses to send
 * ANY invoice with no source_load_id: "This invoice is not linked to a load, so the system holds no
 * delivery evidence for it." The route (POST .../invoices/:id/send) accepts only a `mode` parameter
 * (live_feed | historical_backfill); historical_backfill's own special-case evidence lookup requires
 * current.source_load_id to be set, so it does not help a genuinely load-less document. There is no
 * override parameter anywhere in the real write path for this case. Hand-setting status='sent' (or
 * disabling/overriding the flag) to route around a live financial control is exactly the invented
 * workaround the standing law forbids — DECISION NEEDED posted to NOW-CC-1.md instead. This file is
 * the prepared, rehearsed writer: once the Lead/owner answers, fill INVOICES below (shape kept from
 * the working draft in this PR's history) and run it the same way scripts/ops/2026-09-25-cc1-r153-
 * item2-faro-aging-receipts.ts was run — rehearsal branch, dry run, commit, production.
 *
 * WRITER (once unblocked): the real invoice engine, not a reimplementation —
 *   1. accounting.invoices INSERT, same columns/shape as invoices.routes.ts POST /invoices.
 *   2. accounting.invoice_lines INSERT via the real resolveInvoiceLineRevenueAccountId +
 *      invoiceLineTotalCents (invoice-lines.routes.ts POST .../lines), then the real
 *      recomputeInvoiceTotals (shared.ts).
 *   3. The real sendDraftInvoice (invoice-send.service.ts) — draft -> sent, GL posting via
 *      postInvoiceGlIfEnabled, exactly the production send path.
 *
 * LINE TYPE — a real, load-independent finding while building this, not invented: sendDraftInvoice's
 * own assertLoadRevenueHasSourceLoad guard REFUSES "linehaul" (and every other load-revenue line
 * type) on an invoice with no source_load_id ("refusing orphan revenue post"). Its own comment says
 * the sanctioned shape for exactly this case is line_type "other"/"adjustment" ("Non-load AR (line_
 * type other/adjustment) may omit it"). Because deriveRevenueCode maps "other" to the "accessorial"
 * revenue code (there is no load-less linehaul code in this engine), these 4 lines will post through
 * the accessorial revenue account rather than 4000 Line Haul once unblocked — a real, correctly-
 * reasoned consequence of using the real writer as designed for a load-less document, not a
 * misclassification to invent around; named here for item 9 (chart-of-accounts-per-posting) to see.
 *
 * Idempotent: skips any target display_id that already has a live (non-voided) invoice.
 */
import pg from "pg";

const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SYSTEM_ACTOR_USER_ID = "00000000-0000-4000-8000-000000000001";

type SelfCarried = {
  display_id: string;
  customer_id: string;
  amount_cents: number;
  issue_date: string;
  due_date: string;
  description: string;
};

// All 4 blocked (see header). Populate and run once DECISION NEEDED (NOW-CC-1.md) is answered:
//   009 | d934b8b2-ad1b-4dba-ae61-907afdc9223a (FLS TRANSPORTATION SERVICES LIMITED) | 52500  | 2026-08-13 | 2026-08-14
//   010 | 4fa300b3-45b6-4eef-a484-1c3fe065ad72 (SUPPLY CHAIN MANAGEMENT)             | 400000 | 2026-08-13 | 2026-08-14
//   026 | 0e5d96a1-3758-42a5-b0f1-322a7ed8fff2 (IM Specialized Logistics, LLC.)      | 8740   | 2026-08-25 | 2026-08-26
//   074 | a483ec5e-dd4a-40b2-b822-a9a4058f6460 (Aligator Logistics)                  | 480000 | 2026-09-14 | 2026-09-15
const INVOICES: SelfCarried[] = [];

async function main() {
  if (INVOICES.length === 0) {
    console.log("verify-usmca-book-equals-faro-and-alwaystrack item 6: INVOICES is empty — all 4 remaining self-carried invoices are blocked on the live delivery-evidence gate (see this file's header). Nothing to do until DECISION NEEDED is answered.");
    return;
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA_ID]);

    const { resolveInvoiceDisplayId } = await import("../../apps/backend/src/accounting/display-id.js");
    const { resolveInvoiceLineRevenueAccountId } = await import(
      "../../apps/backend/src/invoices/invoice-line-revenue-resolution.service.js"
    );
    const { invoiceLineTotalCents } = await import("../../apps/backend/src/accounting/invoice-line-total.js");
    const { recomputeInvoiceTotals } = await import("../../apps/backend/src/accounting/shared.js");
    const { sendDraftInvoice } = await import("../../apps/backend/src/accounting/invoice-send.service.js");

    const results: Array<Record<string, unknown>> = [];

    for (const inv of INVOICES) {
      const existing = await client.query<{ id: string }>(
        `SELECT id::text FROM accounting.invoices WHERE operating_company_id = $1::uuid AND display_id = $2 AND voided_at IS NULL LIMIT 1`,
        [USMCA_ID, inv.display_id]
      );
      if (existing.rows[0]) {
        console.log(`SKIP (already exists) display_id=${inv.display_id} invoice_id=${existing.rows[0].id}`);
        results.push({ display_id: inv.display_id, status: "already_exists", invoice_id: existing.rows[0].id });
        continue;
      }

      const customerRes = await client.query<{ id: string; payment_terms_id: string | null; ar_email: string | null; ar_phone: string | null; is_sample_data: boolean }>(
        `SELECT id::text, payment_terms_id::text, ar_email, ar_phone, is_sample_data FROM mdata.customers WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
        [inv.customer_id, USMCA_ID]
      );
      const customer = customerRes.rows[0];
      if (!customer) throw new Error(`customer_id ${inv.customer_id} not found live for display_id ${inv.display_id} -- STOP`);

      const displayId = await resolveInvoiceDisplayId(client, USMCA_ID, new Date(`${inv.issue_date}T00:00:00.000Z`), inv.display_id, null);

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
          inv.customer_id,
          displayId,
          inv.issue_date,
          inv.due_date,
          customer.payment_terms_id,
          "1 Day Quick Pay",
          1,
          customer.ar_email,
          customer.ar_phone,
          `ROUND 153 item 6 -- self-carried invoice, never a Faro purchase. Source: 05-INVOICES-SELF-CARRIED/Invoice ${inv.display_id}*.pdf.`,
          null,
          SYSTEM_ACTOR_USER_ID,
          Boolean(customer.is_sample_data),
        ]
      );
      const invoiceId = invoiceRes.rows[0]?.id;
      if (!invoiceId) throw new Error(`invoice insert failed for display_id ${inv.display_id} -- STOP`);

      // Load-less AR: "other" is the only revenue-bearing line_type assertLoadRevenueHasSourceLoad
      // permits without a source_load_id (see this file's own header note).
      const revenueResolution = await resolveInvoiceLineRevenueAccountId(USMCA_ID, { line_type: "other" });
      const lineTotal = invoiceLineTotalCents(1, inv.amount_cents);
      await client.query(
        `INSERT INTO accounting.invoice_lines (
           operating_company_id, invoice_id, source_load_id, line_type, revenue_code, account_id,
           description, quantity, unit_amount_cents, line_total_cents, display_order
         ) VALUES ($1,$2,NULL,'other',$3,$4,$5,1,$6,$7,0)`,
        [USMCA_ID, invoiceId, revenueResolution.revenue_code, revenueResolution.account_id, inv.description, inv.amount_cents, lineTotal]
      );
      await recomputeInvoiceTotals(client, invoiceId);

      const sendResult = await sendDraftInvoice(client, {
        invoiceId,
        operatingCompanyId: USMCA_ID,
        userId: SYSTEM_ACTOR_USER_ID,
      });
      if (!sendResult.ok) {
        throw new Error(`sendDraftInvoice failed for display_id ${inv.display_id}: ${sendResult.code} ${sendResult.error} ${("message" in sendResult && sendResult.message) || ""}`);
      }

      console.log(`CREATED+SENT display_id=${displayId} invoice_id=${invoiceId} amount=$${(inv.amount_cents / 100).toFixed(2)}`);
      results.push({ display_id: displayId, invoice_id: invoiceId, amount_cents: inv.amount_cents, status: "created_and_sent" });
    }

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
