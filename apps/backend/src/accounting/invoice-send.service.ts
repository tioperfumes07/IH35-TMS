/**
 * ACCT-R-24 / ND-INV-01 B2d — shared draft→sent path for manual POST /send and
 * POD auto-send after proforma convert. No new GL math; reuses existing guards + email queue.
 */
import type { PoolClient } from "pg";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { enqueueEmail } from "../email/queue.service.js";
import { enqueueTmsInvoicePushRequested } from "../qbo/tms-invoice-push-chain.service.js";
import {
  assertLoadRevenueHasSourceLoad,
  assertRevenueLinesHaveIncomeAccount,
  InvoiceLoadSourceRequiredError,
  InvoiceLineIncomeAccountRequiredError,
  type InvoiceLineGuardRow,
} from "./invoice-linkage-guards.js";
import { recomputeInvoiceTotals } from "./shared.js";

export type SendDraftInvoiceOk = { ok: true };
export type SendDraftInvoiceErr = {
  ok: false;
  code: 404 | 409 | 422;
  error: string;
  message?: string;
  factor_id?: string;
  factor_name?: string;
};
export type SendDraftInvoiceResult = SendDraftInvoiceOk | SendDraftInvoiceErr;

export async function sendDraftInvoice(
  client: PoolClient,
  input: { invoiceId: string; operatingCompanyId: string; userId: string }
): Promise<SendDraftInvoiceResult> {
  const currentRes = await client.query(
    `SELECT * FROM accounting.invoices WHERE id = $1 AND operating_company_id = $2 LIMIT 1`,
    [input.invoiceId, input.operatingCompanyId]
  );
  const current = currentRes.rows[0] ?? null;
  if (!current) return { ok: false, code: 404, error: "invoice_not_found" };
  if (String(current.status) === "proforma") {
    return {
      ok: false,
      code: 409,
      error: "invoice_is_proforma",
      message:
        "Pro forma invoices are non-posting projections. Convert at POD (delivered) before send/A/R.",
    };
  }
  if (String(current.status) !== "draft") {
    return { ok: false, code: 409, error: "invoice_not_draft" };
  }

  const sendLinesRes = await client.query(
    `
      SELECT
        id::text,
        line_type::text,
        line_total_cents::bigint AS line_total_cents,
        account_id::text,
        qbo_item_id
      FROM accounting.invoice_lines
      WHERE invoice_id = $1::uuid
      ORDER BY display_order ASC, id ASC
    `,
    [input.invoiceId]
  );
  const sendLines = sendLinesRes.rows as InvoiceLineGuardRow[];
  try {
    assertLoadRevenueHasSourceLoad(
      current.source_load_id ? String(current.source_load_id) : null,
      sendLines
    );
    assertRevenueLinesHaveIncomeAccount(input.operatingCompanyId, sendLines);
  } catch (guardErr) {
    if (guardErr instanceof InvoiceLoadSourceRequiredError) {
      return { ok: false, code: 409, error: "invoice_load_source_required", message: guardErr.message };
    }
    if (guardErr instanceof InvoiceLineIncomeAccountRequiredError) {
      return {
        ok: false,
        code: 422,
        error: "invoice_line_income_account_required",
        message: guardErr.message,
      };
    }
    throw guardErr;
  }

  const invoiceDate = String(current.issue_date);
  const noaCheck = await client.query(
    `
      SELECT
        f.id::text AS factor_id,
        f.name AS factor_name,
        f.noa_stamp_text,
        f.noa_remit_to_name
      FROM factoring.customer_factor_assignment a
      JOIN factoring.factor f ON f.id = a.factor_id
      WHERE a.tenant_id = $1::uuid
        AND a.customer_id = $2::uuid
        AND a.effective_from <= $3::date
        AND (a.effective_to IS NULL OR a.effective_to > $3::date)
      ORDER BY a.effective_from DESC
      LIMIT 1
    `,
    [input.operatingCompanyId, current.customer_id, invoiceDate]
  );
  const noaRow = noaCheck.rows[0] ?? null;
  if (noaRow && !noaRow.noa_stamp_text && !noaRow.noa_remit_to_name) {
    return {
      ok: false,
      code: 422,
      error: "noa_config_missing",
      factor_id: String(noaRow.factor_id),
      factor_name: String(noaRow.factor_name),
    };
  }

  await recomputeInvoiceTotals(client, input.invoiceId);
  await client.query(
    `
      UPDATE accounting.invoices
      SET status = 'sent',
          sent_at = now(),
          updated_at = now(),
          updated_by_user_id = $2
      WHERE id = $1
        AND operating_company_id = $3::uuid
        AND status = 'draft'
    `,
    [input.invoiceId, input.userId, input.operatingCompanyId]
  );
  await appendCrudAudit(
    client,
    input.userId,
    "accounting.invoices.sent",
    {
      resource_type: "accounting.invoices",
      resource_id: input.invoiceId,
      operating_company_id: input.operatingCompanyId,
    },
    "info",
    "P3-T11.20.2-INVOICE-FLOW"
  );
  await enqueueTmsInvoicePushRequested(client, {
    operating_company_id: input.operatingCompanyId,
    invoice_id: input.invoiceId,
    operation: "update",
  });

  const notifyRes = await client.query(
    `
      SELECT
        i.display_id::text AS display_id,
        i.issue_date::text AS issue_date,
        i.currency_code::text AS currency_code,
        i.total_cents::bigint AS total_cents,
        i.customer_notes,
        i.internal_notes,
        c.customer_name::text AS customer_name,
        COALESCE(
          NULLIF(TRIM(c.ap_email), ''),
          NULLIF(TRIM(c.billing_email), ''),
          NULLIF(TRIM(c.ar_email), ''),
          NULLIF(TRIM(i.ar_email_snapshot), '')
        ) AS customer_email
      FROM accounting.invoices i
      JOIN mdata.customers c
        ON c.id = i.customer_id
       AND c.operating_company_id = i.operating_company_id
       AND c.operating_company_id = $2
      WHERE i.id = $1
        AND i.operating_company_id = $2
      LIMIT 1
    `,
    [input.invoiceId, input.operatingCompanyId]
  );
  const notify = notifyRes.rows[0] ?? null;
  const customerEmail = notify?.customer_email ? String(notify.customer_email).trim() : "";
  if (customerEmail && notify) {
    const total = (Number(notify.total_cents ?? 0) / 100).toFixed(2);
    void enqueueEmail({
      operatingCompanyId: input.operatingCompanyId,
      toAddresses: [customerEmail],
      subject: `Invoice ${notify.display_id} — IH 35 TMS`,
      templateKey: "invoice-send",
      templateVars: {
        invoiceDisplayId: String(notify.display_id ?? ""),
        customerName: String(notify.customer_name ?? "Customer"),
        issueDate: String(notify.issue_date ?? ""),
        currency: String(notify.currency_code ?? "USD"),
        total,
        memo: String(notify.customer_notes ?? notify.internal_notes ?? ""),
      },
      queuedByUserId: input.userId,
    }).catch(() => undefined);
  }

  return { ok: true };
}
