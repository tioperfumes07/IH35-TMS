/**
 * ACCT-F5701 — bill a genuinely-billable cancellation charge (TONU) to the customer.
 *
 * Design: docs/specs/DESIGN-tonu-cancellation-ar-and-accessorial-coa-HOLD.md §3.2. Owner ruling on
 * TONU presentation is RESOLVED (§7.2, 2026-07-21): TONU is operating (accessorial) revenue.
 * Live board answer (2026-08-21) refined the implementation: bill to the EXISTING Accessorial/
 * Detention Income account via the existing revenue-category resolution mechanism — no new account,
 * no new GL math. This mirrors accounting/from-load.ts's buildInvoiceFromLoad exactly (same
 * display-id generator, same revenue resolver, same totals recompute), but cannot reuse that
 * function directly: it derives its line amount from the LOAD's own rate_total_cents (freight), and
 * a TONU charge is a different, caller-supplied amount, not the load's rate.
 *
 * Flag-gated: TONU_CANCELLATION_AR_POSTING_ENABLED, default OFF, per-entity override only (matches
 * '_POSTING_ENABLED' pattern -> isPostingFlag() auto-recognizes it as per-entity-only). Flag OFF
 * means this function is never called (the caller checks first) — today's behaviour (charge
 * captured, never billed) is exactly preserved until the owner flips it on for an entity.
 */
import { resolveInvoiceLineRevenueAccountId } from "../invoices/invoice-line-revenue-resolution.service.js";
import { nextInvoiceDisplayId } from "../accounting/display-id.js";
import { recomputeInvoiceTotals } from "../accounting/shared.js";
import { appendCrudAudit } from "../audit/crud-audit.js";

export const TONU_CANCELLATION_AR_POSTING_FLAG_KEY = "TONU_CANCELLATION_AR_POSTING_ENABLED";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export type CreateTonuInvoiceInput = {
  operatingCompanyId: string;
  loadId: string;
  cancellationChargeCents: number;
  actorUserId: string;
};

export type CreateTonuInvoiceResult = {
  invoiceId: string;
  invoiceLineId: string;
  displayId: string;
};

/**
 * Raises a real, standalone customer invoice for a billable-cancellation (TONU) charge and links it
 * back to the cancellation row (design §3.1/§3.5). Idempotent on (load_id, 'tonu'): a retry finds
 * the existing non-void TONU invoice for this load and returns it rather than double-billing.
 */
export async function createTonuInvoiceForCancellation(
  client: Queryable,
  input: CreateTonuInvoiceInput
): Promise<CreateTonuInvoiceResult> {
  if (!Number.isFinite(input.cancellationChargeCents) || input.cancellationChargeCents <= 0) {
    throw Object.assign(new Error("tonu_charge_not_positive"), { code: "tonu_charge_not_positive" });
  }

  // Idempotency: a TONU invoice already raised for this load (any non-void status) wins — never
  // double-bill on a retried cancellation call.
  const existing = await client.query<{ id: string; display_id: string }>(
    `
      SELECT i.id::text AS id, i.display_id
        FROM accounting.invoices i
        JOIN accounting.invoice_lines il ON il.invoice_id = i.id AND il.line_type = 'tonu'
       WHERE i.operating_company_id = $1::uuid
         AND i.source_load_id = $2
         AND i.voided_at IS NULL
       LIMIT 1
    `,
    [input.operatingCompanyId, input.loadId]
  );
  if (existing.rows[0]) {
    const lineRes = await client.query<{ id: string }>(
      `SELECT id::text AS id FROM accounting.invoice_lines WHERE invoice_id = $1::uuid AND line_type = 'tonu' LIMIT 1`,
      [existing.rows[0].id]
    );
    return {
      invoiceId: existing.rows[0].id,
      invoiceLineId: String(lineRes.rows[0]?.id ?? ""),
      displayId: existing.rows[0].display_id,
    };
  }

  const loadRes = await client.query<{
    load_number: string;
    customer_id: string;
    is_sample_data: boolean;
    payment_terms_id: string | null;
    payment_terms_label: string | null;
    payment_terms_days: number | null;
    ar_email: string | null;
    ar_phone: string | null;
  }>(
    `
      SELECT
        l.load_number,
        l.customer_id,
        l.is_sample_data,
        c.payment_terms_id,
        c.ar_email,
        c.ar_phone,
        pt.terms_name AS payment_terms_label,
        pt.days_until_due AS payment_terms_days
      FROM mdata.loads l
      JOIN mdata.customers c ON c.id = l.customer_id AND c.operating_company_id = l.operating_company_id
      LEFT JOIN catalogs.payment_terms pt ON pt.id = c.payment_terms_id
      WHERE l.id = $1
        AND l.operating_company_id = $2::uuid
      LIMIT 1
    `,
    [input.loadId, input.operatingCompanyId]
  );
  const load = loadRes.rows[0];
  if (!load) throw Object.assign(new Error("load_not_found"), { code: "load_not_found" });

  const loadNumber = String(load.load_number ?? "").trim();
  if (!loadNumber) {
    throw Object.assign(new Error("load_number_required_for_invoice_line"), { code: "load_number_required_for_invoice_line" });
  }

  const issueDate = new Date();
  const paymentTermsDays = Number(load.payment_terms_days ?? 30);
  const dueDate = new Date(issueDate);
  dueDate.setUTCDate(dueDate.getUTCDate() + paymentTermsDays);
  const displayId = await nextInvoiceDisplayId(client, input.operatingCompanyId, issueDate);

  const invoiceRes = await client.query<{ id: string }>(
    `
      INSERT INTO accounting.invoices (
        operating_company_id, customer_id, display_id, status, source_load_id, issue_date, due_date,
        payment_terms_id, payment_terms_label, payment_terms_days, ar_email_snapshot, ar_phone_snapshot,
        invoice_type, created_by_user_id, updated_by_user_id, is_sample_data
      ) VALUES (
        $1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11,'cancellation_tonu',$12,$12,$13
      )
      RETURNING id::text AS id
    `,
    [
      input.operatingCompanyId,
      load.customer_id,
      displayId,
      input.loadId,
      issueDate.toISOString().slice(0, 10),
      dueDate.toISOString().slice(0, 10),
      load.payment_terms_id ?? null,
      load.payment_terms_label ?? null,
      paymentTermsDays,
      load.ar_email ?? null,
      load.ar_phone ?? null,
      input.actorUserId,
      load.is_sample_data ?? false,
    ]
  );
  const invoiceId = String(invoiceRes.rows[0]?.id ?? "");
  if (!invoiceId) throw Object.assign(new Error("tonu_invoice_create_failed"), { code: "tonu_invoice_create_failed" });

  const revenueResolution = await resolveInvoiceLineRevenueAccountId(input.operatingCompanyId, { line_type: "tonu" });
  const description = `TONU (Truck Order Not Used) · Load ${loadNumber}`;
  const lineRes = await client.query<{ id: string }>(
    `
      INSERT INTO accounting.invoice_lines (
        operating_company_id, invoice_id, source_load_id, line_type, revenue_code, account_id,
        description, quantity, unit_amount_cents, line_total_cents, display_order
      ) VALUES ($1,$2,$3,'tonu',$4,$5,$6,1,$7,$7,0)
      RETURNING id::text AS id
    `,
    [
      input.operatingCompanyId,
      invoiceId,
      input.loadId,
      revenueResolution.revenue_code,
      revenueResolution.account_id,
      description,
      input.cancellationChargeCents,
    ]
  );
  const invoiceLineId = String(lineRes.rows[0]?.id ?? "");
  // DSP-MONEY-F7196 (CC-1): mirror the invoice header's own zero-rows check above — a lost/suppressed
  // invoice_lines write must not silently continue into totals recompute + audit + success carrying a
  // blank line id. Throw inside this same transaction so the whole TONU invoice rolls back rather than
  // committing a header-only invoice with no line.
  if (!invoiceLineId) {
    throw Object.assign(new Error("tonu_invoice_line_create_failed"), { code: "tonu_invoice_line_create_failed" });
  }

  await recomputeInvoiceTotals(client, invoiceId);

  await appendCrudAudit(
    client as never,
    input.actorUserId,
    "accounting.invoice.tonu_cancellation_charge_billed",
    { invoice_id: invoiceId, invoice_line_id: invoiceLineId, load_id: input.loadId, amount_cents: input.cancellationChargeCents },
    "info",
    "ACCT-F5701"
  );

  return { invoiceId, invoiceLineId, displayId };
}
