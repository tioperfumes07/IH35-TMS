/**
 * LEAD 443.128 A — THE invoice-line writer (extracted from invoice-lines.routes.ts POST, unchanged behaviour): a line is added only
 * to a DRAFT invoice; its income account is the explicit postable Income account or the line type's revenue resolution; the item
 * must default to that account (or carry an override reason); totals recompute; one audit row; the QBO push is enqueued. The
 * route and the lumper advance (cash-advances/lumper-advance-expense.service.ts) both call it — one writer, never a copy.
 */
import { appendCrudAudit } from "../audit/crud-audit.js";
import { deriveRevenueCode, resolveInvoiceLineRevenueAccountId } from "../invoices/invoice-line-revenue-resolution.service.js";
import { enqueueTmsInvoicePushRequested } from "../qbo/tms-invoice-push-chain.service.js";
import { invoiceLineTotalCents } from "./invoice-line-total.js";
import { assertLineAccountMatchesItem } from "./line-categorization.js";
import { recomputeInvoiceTotals } from "./shared.js";

export type InvoiceLineType = "linehaul" | "fsc" | "detention" | "layover" | "lumper" | "tonu" | "accessorial" | "tax" | "adjustment" | "other";

export type CreateInvoiceLineInput = {
  operatingCompanyId: string;
  invoiceId: string;
  line_type: InvoiceLineType;
  description: string;
  quantity: number;
  unit_amount_cents: number;
  source_load_id?: string;
  account_id?: string;
  qbo_class_snapshot?: string;
  qbo_item_id?: string;
  item_id?: string;
  display_order?: number;
  item_account_override_reason?: string | null;
};

export async function assertExplicitIncomeAccount(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  operatingCompanyId: string,
  accountId: string
) {
  const res = await client.query(
    `
      SELECT id
      FROM catalogs.accounts
      WHERE id = $1
        AND operating_company_id = $2::uuid
        AND deactivated_at IS NULL
        AND is_postable = true
        AND account_type IN ('Income', 'OtherIncome')
      LIMIT 1
    `,
    [accountId, operatingCompanyId]
  );
  if (!res.rows[0]) {
    throw Object.assign(new Error("invoice_line_income_account_invalid"), { code: "invoice_line_income_account_invalid" });
  }
}


export async function ensureDraftInvoice(client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> }, invoiceId: string, operatingCompanyId: string) {
  const invoiceRes = await client.query(
    `
      SELECT *
      FROM accounting.invoices
      WHERE id = $1
        AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [invoiceId, operatingCompanyId]
  );
  const invoice = invoiceRes.rows[0] ?? null;
  if (!invoice) return { ok: false as const, code: 404 as const, error: "invoice_not_found" };
  if (String(invoice.status) !== "draft") return { ok: false as const, code: 409 as const, error: "invoice_not_draft" };
  return { ok: true as const, invoice };
}


// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createInvoiceLineInClientTx(client: any, input: CreateInvoiceLineInput, userId: string) {
  const guard = await ensureDraftInvoice(client, input.invoiceId, input.operatingCompanyId);
  if (!guard.ok) return guard;
  const lineTotal = invoiceLineTotalCents(input.quantity, input.unit_amount_cents);
  let revenueCode: string;
  let accountId: string;
  if (input.account_id) {
    await assertExplicitIncomeAccount(client, input.operatingCompanyId, input.account_id);
    // The explicit account is validated above; its revenue code is the line type's (pure — no second connection inside the
    // caller's transaction).
    revenueCode = deriveRevenueCode({ line_type: input.line_type });
    accountId = input.account_id;
  } else {
    const revenueResolution = await resolveInvoiceLineRevenueAccountId(input.operatingCompanyId, {
      line_type: input.line_type,
    });
    revenueCode = revenueResolution.revenue_code;
    accountId = revenueResolution.account_id;
  }
  await assertLineAccountMatchesItem(client, {
    operatingCompanyId: input.operatingCompanyId,
    side: "income",
    itemId: input.item_id,
    accountId,
    overrideReason: input.item_account_override_reason,
  });
  const rowRes = await client.query(
    `
      INSERT INTO accounting.invoice_lines (
        operating_company_id,
        invoice_id,
        source_load_id,
        line_type,
        revenue_code,
        account_id,
        description,
        quantity,
        unit_amount_cents,
        line_total_cents,
        qbo_class_snapshot,
        qbo_item_id,
        item_id,
        item_account_override_reason,
        display_order
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$15,
        COALESCE($14, (
          SELECT COALESCE(MAX(display_order), -1) + 1
          FROM accounting.invoice_lines
          WHERE invoice_id = $2
        ))
      )
      RETURNING *
    `,
    [
      input.operatingCompanyId,
      input.invoiceId,
      input.source_load_id ?? null,
      input.line_type,
      revenueCode,
      accountId,
      input.description,
      input.quantity,
      input.unit_amount_cents,
      lineTotal,
      input.qbo_class_snapshot ?? null,
      input.qbo_item_id ?? null,
      input.item_id ?? null,
      input.display_order ?? null,
      input.item_account_override_reason?.trim() || null,
    ]
  );
  const line = rowRes.rows[0] ?? null;
  if (!line) return { ok: false as const, code: 500 as const, error: "invoice_line_create_failed" };
  const totals = await recomputeInvoiceTotals(client, input.invoiceId);
  await appendCrudAudit(
    client,
    userId,
    "accounting.invoice_lines.created",
    {
      resource_type: "accounting.invoice_lines",
      resource_id: line.id,
      invoice_id: input.invoiceId,
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
  return { ok: true as const, code: 201 as const, data: { line, totals } };
}
