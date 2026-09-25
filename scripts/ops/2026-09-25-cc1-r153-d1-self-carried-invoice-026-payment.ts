/**
 * R-153.8 Decision 1 (Lead, 2026-09-25 6:22 AM CT/11:22Z) — posts the one real gap found while
 * investigating the 5 self-carried invoice PDFs in
 * ~/Downloads/IH35-MASTER-RECONCILIATION/05-INVOICES-SELF-CARRIED/.
 *
 * Invoice PDF "026" (bill-to IM Specialized Logistics, LLC., ship-to MS World Wide, dated
 * 08/25/2026, $3,120.00 billed, a $3,032.60 PAYMENT line already shown on the signed document,
 * $87.40 balance due) is the SAME transaction as live accounting.invoices display_id="13540":
 * same customer (IM Specialized Logistics, LLC.), same amount to the cent ($3,120.00), and
 * source_load_id already set to load 13540 (IM Specialized customer). That invoice is already
 * status='sent', already unfactored -- it was never blocked by the delivery-evidence gate at all,
 * so nothing here touches that gate or any override. The only real gap: the $3,032.60 payment
 * shown on the signed PDF was never posted against it (amount_paid_cents=0 live, confirmed before
 * writing this).
 *
 * Two other PDFs in the same folder ("009" FLS $525.00, "055-13555" 2EMS $3,180.00) are ALSO
 * already fully live (display_id 13513 / 13555, sent, linked, unfactored) -- no write needed for
 * either, confirmed live before writing this script. Two more ("010" Supply Chain Management
 * $4,000.00, "074-13593" Aligator $4,800.00) have no rate confirmation or settlement document
 * anywhere in either reconciliation package, and load 13593 itself no longer exists in production
 * at all (was live 3 days ago per an earlier coder's own record) -- reported in PR #22607's body,
 * not booked from guesswork, per the Lead's own step-4 allowance for exactly this shape.
 *
 * WRITER: the existing customer-payment engine, the same shape as ROUND 153 item 2 (PR #22569):
 * an accounting.payments row, then apps/backend/src/accounting/payments/apply.service.ts's
 * applyPayment() (the real, shared application + GL-posting engine). No new engine.
 *
 * PAYMENT DATE: no remittance advice exists for this receipt (the PDF shows only the payment
 * amount, no date) -- the same gap the 09-22 coder box already flagged ("evidence needed to close:
 * IM Specialized remittance advice for invoice 026"). Dated to the invoice's own due date
 * (2026-08-26, "1 Day Quick Pay" terms), the one date the signed document itself actually
 * supports, same principle as item 2's "dated as the source document dates it". This does not
 * change any dollar figure or GL account, only which day the receipt posts on.
 *
 * Idempotent: skips if the invoice's live open balance is already at or below the post-receipt
 * target (a prior run of this same script already applied it).
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
const INVOICE_DISPLAY_ID = "13540";
const RECEIPT_CENTS = 303260; // $3,032.60
const RECEIPT_DATE = "2026-08-26"; // invoice's own due date -- the one date the PDF supports

async function main() {
  const { applyPayment } = await import("../../apps/backend/src/accounting/payments/apply.service.js");
  const { nextPaymentDisplayId } = await import("../../apps/backend/src/accounting/display-id.js");

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA_ID]);

    const invRes = await client.query<{ id: string; customer_id: string; status: string; amount_open_cents: string; total_cents: string }>(
      `SELECT id::text, customer_id::text, status::text, amount_open_cents::text, total_cents::text
         FROM accounting.invoices WHERE operating_company_id = $1::uuid AND display_id = $2 LIMIT 1`,
      [USMCA_ID, INVOICE_DISPLAY_ID]
    );
    const invoice = invRes.rows[0];
    if (!invoice) throw new Error(`invoice display_id=${INVOICE_DISPLAY_ID}: not found -- STOP`);
    if (Number(invoice.total_cents) !== 312000) {
      throw new Error(`invoice ${INVOICE_DISPLAY_ID}: total_cents=${invoice.total_cents}, expected 312000 -- refusing, does not match the signed PDF`);
    }

    const targetOpenCents = Number(invoice.total_cents) - RECEIPT_CENTS;
    const currentOpenCents = Number(invoice.amount_open_cents);
    if (currentOpenCents <= targetOpenCents) {
      console.log(`SKIP (already applied): open=${currentOpenCents} already <= target=${targetOpenCents}`);
      await client.query("ROLLBACK");
      console.log(JSON.stringify({ status: "already_applied", open_cents: currentOpenCents }, null, 2));
      return;
    }
    if (!["sent", "partial"].includes(invoice.status)) {
      throw new Error(`invoice ${INVOICE_DISPLAY_ID}: status=${invoice.status}, not open for payment -- STOP`);
    }

    const depositRes = await client.query<{ account_id: string }>(
      `SELECT car.account_id::text
         FROM accounting.chart_of_accounts_roles car
         JOIN catalogs.accounts a ON a.id = car.account_id
        WHERE car.operating_company_id = $1::uuid AND car.role = 'undeposited_funds' AND car.is_active = true
          AND a.deactivated_at IS NULL AND a.is_postable = true
        ORDER BY car.updated_at DESC LIMIT 1`,
      [USMCA_ID]
    );
    const depositedToAccountId = depositRes.rows[0]?.account_id;
    if (!depositedToAccountId) throw new Error("undeposited_funds role account did not resolve live -- refusing to guess a deposit account");

    const displayId = await nextPaymentDisplayId(client, USMCA_ID, new Date(`${RECEIPT_DATE}T00:00:00.000Z`));
    const paymentRes = await client.query<{ id: string }>(
      `INSERT INTO accounting.payments (
         operating_company_id, customer_id, display_id, payment_method, payment_date, reference,
         amount_cents, deposited_to_account_id, notes, created_by_user_id, payment_source_kind,
         source_bank_transaction_id, is_sample_data
       ) VALUES ($1,$2,$3,'other',$4,$5,$6,$7,$8,$9,'manual',NULL,false)
       RETURNING id::text`,
      [
        USMCA_ID,
        invoice.customer_id,
        displayId,
        RECEIPT_DATE,
        "IM-SPECIALIZED-INV-026",
        RECEIPT_CENTS,
        depositedToAccountId,
        `R-153.8 D1 -- payment shown on signed self-carried invoice PDF "026" (IM Specialized Logistics, LLC.), $3,032.60 of $3,120.00, $87.40 remains open per the PDF. Dated to the invoice's own due date -- no remittance advice on file names the exact date.`,
        SYSTEM_ACTOR_USER_ID,
      ]
    );
    const paymentId = paymentRes.rows[0]?.id;
    if (!paymentId) throw new Error("payment insert failed -- STOP");

    const applyResult = await applyPayment(
      client,
      {
        operating_company_id: USMCA_ID,
        payment_id: paymentId,
        applications: [{ target_kind: "invoice", target_id: invoice.id, amount_cents: RECEIPT_CENTS }],
      },
      { user_id: SYSTEM_ACTOR_USER_ID }
    );

    if (process.env.DRY_RUN === "1") {
      console.log("DRY_RUN=1 -- rolling back, nothing committed.");
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
      console.log("COMMITTED.");
    }
    console.log(`POSTED invoice=${INVOICE_DISPLAY_ID} payment=${displayId} receipt=$${(RECEIPT_CENTS / 100).toFixed(2)} gl_posting=${applyResult.gl_posting}`);
    console.log(JSON.stringify({ status: "posted", invoice_display_id: INVOICE_DISPLAY_ID, payment_id: paymentId, payment_display_id: displayId, receipt_cents: RECEIPT_CENTS, gl_posting: applyResult.gl_posting }, null, 2));
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
