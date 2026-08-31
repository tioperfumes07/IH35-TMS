/**
 * GO-AMENDMENT CARVE-OUT 1 FOLLOW-UP (INBOX-CC-1.md CURRENT GO, 2026-08-30): "HANDOFF 03-CC-1 · 016
 * then SETL tieout" / "FACT-PLEDGE-NET-CM shipping · 016=$4200+CM $400 unknown_pending_backup · wait
 * deploy for pledge net". The earlier amendment (ACCT-F10147) correctly voided the WRONG $3,800-only
 * invoice 016 (no QuickBooks doc existed for that number, AlwaysTrack load 13524 is $4,200 gross, not
 * $3,800). This is the corrected rebuild: create the invoice at the REAL load amount, $4,200.00, then
 * issue and apply a $400.00 credit memo (reason='unknown_pending_backup', matching Faro's own factored
 * face of $3,800.00) so the invoice's own open balance nets to exactly what Faro actually pledged/
 * funded. Confirmed live before running: origin/main HEAD (deployed, healthz sha ancestor-checked)
 * already carries FACT-PLEDGE-NET-CM (ACCT-F5920/#18404, factoring-advances.routes.ts's reserve/fee
 * base already reads open AR net of applied credit memos, not the invoice header total) and the real
 * credit-memos.routes.ts CRUD+apply path (ACCT-F5606) -- both prerequisites this rebuild depends on.
 *
 * Reuses the EXACT same INSERT/UPDATE shapes the real routes use (invoices.routes.ts's create path via
 * the same helpers TASK6 used; credit-memos.routes.ts's POST /credit-memos and POST /credit-memos/:id/
 * apply, statement-for-statement) rather than inventing new SQL -- this is a one-time backfill script,
 * not a new code path, so it must not diverge from what the real endpoints would do.
 *
 * Usage:
 *   DATABASE_URL=<pooled, neondb_owner> npx tsx scripts/run-fix-invoice-016-rebuild-4200-cm400-once.mts          # dry run
 *   DATABASE_URL=<pooled, neondb_owner> npx tsx scripts/run-fix-invoice-016-rebuild-4200-cm400-once.mts --commit  # apply
 */
import pg from "pg";
import { nextInvoiceDisplayId, nextCreditMemoDisplayId } from "../apps/backend/src/accounting/display-id.js";
import { recomputeInvoiceTotals } from "../apps/backend/src/accounting/shared.js";
import { resolveInvoiceLineRevenueAccountId } from "../apps/backend/src/invoices/invoice-line-revenue-resolution.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR_USER_UUID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const CUSTOMER_ID = "a760ee40-ad82-4bb5-9120-4d0766b46297"; // MPH CARRIER SERVICES, INC (same row-016 customer TASK6 resolved)
const ISSUE_DATE = "2026-08-18";
const DUE_DATE = "2026-09-17";
const PO_REF = "MPHC261334";
const FACE_CENTS = 420000; // $4,200.00 -- real AlwaysTrack load 13524 gross rate
const CM_CENTS = 40000; // $400.00 credit memo
const CM_REASON = "unknown_pending_backup";
const NET_EXPECTED_CENTS = FACE_CENTS - CM_CENTS; // $3,800.00 -- must equal Faro's own factored face

const COMMIT = process.argv.includes("--commit");
const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL || "";
if (!dbUrl) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL required");

async function main() {
  const pool = new pg.Pool({ connectionString: dbUrl, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA]);

    // Refuse to duplicate -- only a VOIDED row for this specific gap (ACCT-F10147's 016) should exist.
    const existing = await client.query(
      `SELECT id, display_id, status FROM accounting.invoices
        WHERE operating_company_id = $1::uuid AND internal_notes ILIKE '%row 016 rebuild%'`,
      [USMCA]
    );
    if (existing.rows.length > 0) {
      throw new Error(`A row-016-rebuild invoice already exists: ${JSON.stringify(existing.rows)} -- refusing to duplicate`);
    }

    const customerRes = await client.query<{
      id: string;
      payment_terms_id: string | null;
      ar_email: string | null;
      ar_phone: string | null;
      is_sample_data: boolean;
      terms_name: string | null;
      days_until_due: number | null;
    }>(
      `
        SELECT c.id, c.payment_terms_id, c.ar_email, c.ar_phone, c.is_sample_data,
               pt.terms_name, pt.days_until_due
        FROM mdata.customers c
        LEFT JOIN catalogs.payment_terms pt ON pt.id = c.payment_terms_id
        WHERE c.id = $1 AND c.operating_company_id = $2::uuid
      `,
      [CUSTOMER_ID, USMCA]
    );
    const customer = customerRes.rows[0];
    if (!customer) throw new Error(`customer ${CUSTOMER_ID} not found`);

    // ---- 1. Invoice at the real $4,200.00 face -----------------------------------------------
    const invoiceDisplayId = await nextInvoiceDisplayId(client as never, USMCA, new Date(`${ISSUE_DATE}T00:00:00.000Z`));
    const invRes = await client.query<{ id: string }>(
      `
        INSERT INTO accounting.invoices (
          operating_company_id, customer_id, display_id, status, issue_date, due_date,
          payment_terms_id, payment_terms_label, payment_terms_days, ar_email_snapshot,
          ar_phone_snapshot, internal_notes, customer_notes, currency_code,
          created_by_user_id, updated_by_user_id, source_load_id, is_sample_data
        ) VALUES (
          $1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11,NULL,'USD',$12,$12,NULL,$13
        )
        RETURNING id
      `,
      [
        USMCA,
        CUSTOMER_ID,
        invoiceDisplayId,
        ISSUE_DATE,
        DUE_DATE,
        customer.payment_terms_id ?? null,
        customer.terms_name ?? null,
        Number(customer.days_until_due ?? 30),
        customer.ar_email ?? null,
        customer.ar_phone ?? null,
        `GO-amendment row 016 rebuild (PO ${PO_REF}) -- real AlwaysTrack load 13524 gross $4,200.00; ` +
          `supersedes voided INV-2026-00062 (ACCT-F10147, wrongly $3,800-only, no QBO doc). ` +
          `Faro factored/pledged net $3,800.00 via a $400.00 credit memo, reason=${CM_REASON}.`,
        ACTOR_USER_UUID,
        Boolean(customer.is_sample_data),
      ]
    );
    const invoiceId = invRes.rows[0]!.id;

    const revenue = await resolveInvoiceLineRevenueAccountId(USMCA, { line_type: "linehaul" });
    await client.query(
      `
        INSERT INTO accounting.invoice_lines (
          operating_company_id, invoice_id, source_load_id, line_type, revenue_code, account_id,
          description, quantity, unit_amount_cents, line_total_cents, display_order
        ) VALUES ($1,$2,NULL,'linehaul',$3,$4,$5,1,$6,$6,0)
      `,
      [USMCA, invoiceId, revenue.revenue_code, revenue.account_id, `MPH load 13524 (PO ${PO_REF}) -- row 016 rebuild`, FACE_CENTS]
    );

    const totals = await recomputeInvoiceTotals(client as never, invoiceId);
    const actualTotal = Number((totals as { total_cents?: number })?.total_cents ?? 0);
    if (actualTotal !== FACE_CENTS) {
      throw new Error(`invoice total mismatch: expected ${FACE_CENTS}, got ${actualTotal}`);
    }
    console.log(`INVOICE CREATED: ${invoiceDisplayId} (${invoiceId}) face=$${(FACE_CENTS / 100).toFixed(2)}`);

    // ---- 2. Credit memo, $400.00, reason=unknown_pending_backup ------------------------------
    const cmDisplayId = await nextCreditMemoDisplayId(client as never, USMCA, new Date(`${ISSUE_DATE}T00:00:00.000Z`));
    const cmRes = await client.query<{ id: string; amount_cents: string; amount_applied_cents: string }>(
      `INSERT INTO accounting.credit_memos
         (operating_company_id, customer_id, display_id, status, reason, issue_date, amount_cents, notes, created_by_user_id)
       VALUES ($1, $2, $3, 'issued', $4, $5, $6, $7, $8)
       RETURNING id, display_id, status, reason, issue_date, amount_cents, amount_applied_cents`,
      [
        USMCA,
        CUSTOMER_ID,
        cmDisplayId,
        CM_REASON,
        ISSUE_DATE,
        CM_CENTS,
        "GO-amendment row 016: unverified pending broker backup (per amendment, do NOT stamp late) -- " +
          "nets the $4,200 real load amount to Faro's own factored face, $3,800.00. Do not treat as late.",
        ACTOR_USER_UUID,
      ]
    );
    const creditMemo = cmRes.rows[0]!;
    console.log(`CREDIT MEMO CREATED: ${creditMemo.display_id} (${creditMemo.id}) amount=$${(CM_CENTS / 100).toFixed(2)} reason=${CM_REASON}`);

    // ---- 3. Apply the credit memo to the invoice, matching /credit-memos/:id/apply exactly ---
    const unapplied = Number(creditMemo.amount_cents) - Number(creditMemo.amount_applied_cents);
    if (CM_CENTS > unapplied) throw new Error(`over_apply_refused: unapplied=${unapplied} requested=${CM_CENTS}`);

    const invoiceCheck = await client.query<{ id: string; customer_id: string; total_cents: string; amount_paid_cents: string }>(
      `SELECT id, customer_id, total_cents, amount_paid_cents FROM accounting.invoices
        WHERE id = $1 AND operating_company_id = $2::uuid AND voided_at IS NULL LIMIT 1`,
      [invoiceId, USMCA]
    );
    const inv = invoiceCheck.rows[0];
    if (!inv) throw new Error("invoice_not_found");
    if (String(inv.customer_id) !== String(CUSTOMER_ID)) throw new Error("invoice_customer_mismatch");

    const alreadyAppliedRes = await client.query<{ applied_cents: string }>(
      `SELECT COALESCE(SUM(applied_cents), 0)::text AS applied_cents
         FROM accounting.credit_memo_applications
        WHERE invoice_id = $1 AND operating_company_id = $2::uuid AND voided_at IS NULL`,
      [invoiceId, USMCA]
    );
    const invoiceRemainingCents =
      Number(inv.total_cents ?? 0) - Number(inv.amount_paid_cents ?? 0) - Number(alreadyAppliedRes.rows[0]?.applied_cents ?? 0);
    if (CM_CENTS > invoiceRemainingCents) {
      throw new Error(`applied_cents_exceeds_invoice_balance: applying=${CM_CENTS} remaining=${invoiceRemainingCents}`);
    }

    const appRes = await client.query<{ id: string }>(
      `INSERT INTO accounting.credit_memo_applications
         (operating_company_id, credit_memo_id, invoice_id, applied_cents, applied_by_user_id, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [USMCA, creditMemo.id, invoiceId, CM_CENTS, ACTOR_USER_UUID, `row-016-rebuild-${invoiceId}`]
    );
    console.log(`CREDIT MEMO APPLIED: application id ${appRes.rows[0]!.id}, $${(CM_CENTS / 100).toFixed(2)} -> invoice ${invoiceDisplayId}`);

    await client.query(
      `UPDATE accounting.credit_memos
         SET amount_applied_cents = amount_applied_cents + $2,
             status = CASE WHEN amount_applied_cents + $2 >= amount_cents THEN 'applied' ELSE status END
       WHERE id = $1`,
      [creditMemo.id, CM_CENTS]
    );

    // ---- 4. Final tie-out: invoice open balance must equal Faro's factored face, $3,800.00 ---
    const finalCheck = await client.query<{ total_cents: string; amount_paid_cents: string }>(
      `SELECT total_cents, amount_paid_cents FROM accounting.invoices WHERE id = $1`,
      [invoiceId]
    );
    const openAfterCm =
      Number(finalCheck.rows[0]!.total_cents) - Number(finalCheck.rows[0]!.amount_paid_cents) - CM_CENTS;
    if (openAfterCm !== NET_EXPECTED_CENTS) {
      throw new Error(`net tie-out mismatch: expected ${NET_EXPECTED_CENTS}, computed ${openAfterCm}`);
    }
    console.log(`NET TIE-OUT: invoice open balance net of CM = $${(openAfterCm / 100).toFixed(2)} (expected $3,800.00 to match Faro's factored face)`);

    if (!COMMIT) {
      console.log("DRY RUN -- rolling back. Pass --commit to apply.");
      await client.query("ROLLBACK");
      return;
    }
    await client.query("COMMIT");
    console.log("COMMITTED.");

    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    const verify = await client.query(
      `SELECT i.display_id, i.status, i.total_cents,
              cm.display_id AS cm_display_id, cm.status AS cm_status, cm.amount_cents AS cm_amount_cents, cm.amount_applied_cents AS cm_applied
         FROM accounting.invoices i, accounting.credit_memos cm
        WHERE i.id = $1 AND cm.id = $2`,
      [invoiceId, creditMemo.id]
    );
    await client.query("COMMIT");
    console.log("VERIFY:", JSON.stringify(verify.rows[0]));
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
