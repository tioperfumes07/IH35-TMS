/**
 * credit-memo-from-invoice.service.ts — ACCT-F11101 (owner Jorge, 11-04 08:44 CT: "7-ok folow qb").
 *
 * THE QUICKBOOKS RULE: a SENT invoice is never rewritten. A correction is a CREDIT MEMO against it, so the original and the
 * correction both stay on the record. Every amount writer of an invoice (PATCH /invoices/:id, the line create / edit / delete
 * routes, the load-rate re-sync) is limited to draft / proforma and refuses a sent invoice with INVOICE_NOT_DRAFT_MESSAGE,
 * which names the credit memo. This module is the credit memo side of that rule:
 *
 *   creditMemoTargetInvoiceRefusal — the invoice a credit memo is created FROM must be this company's, issued (not draft,
 *     proforma or void), billed to the same customer, and — when the memo is applied to it on creation — the memo may not
 *     exceed the invoice's open balance (total − paid − credit memos already applied). Exactly QBO: applied lowers the
 *     invoice's open balance; left unapplied it is customer credit.
 *   recordFactoredInvoiceCreditMemoLink — when the invoice is FACTORED (a live line on a posted, unvoided Faro purchase, or
 *     a legacy factoring advance), the credit memo's journal entry legs are linked on the spine to the purchase / advance
 *     and the Faro invoice number is audited. NO Faro posting is made here: Faro has moved no money when we issue a credit
 *     memo, so 2150 (factoring advance liability) stays at what Faro advanced. Faro's own documents post its side through
 *     the existing posters — the cash-reserve report's short_pay row (DR 2150 / CR 1235, faro-reserve-entries.service.ts)
 *     when the debtor pays the reduced amount, or the full-recourse chargeback (postFactoringChargebackEvent). The short-pay
 *     resolution then recognizes THIS credit memo (short-pay-resolution.service.ts, resolution via existing_credit_memo_id)
 *     instead of writing the same shortfall down a second time.
 * No GL math here: the credit memo posts through the posting engine (Dr the reason account / Cr A/R) in the create route.
 */
import { appendCrudAudit } from "../audit/crud-audit.js";
import { writeTransactionSourceLink } from "./accounting-spine-emit.js";

type Db = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

/** The refusal every invoice amount writer returns for a sent invoice — it points at the credit memo. */
export const INVOICE_NOT_DRAFT_MESSAGE =
  "This invoice has been sent, so its amount and lines cannot be edited. Use \"Create credit memo\" on the invoice to correct it — the original invoice and the credit memo both stay on record (QuickBooks rule).";

/** The refusal text for an invoice amount / line writer: a sent invoice points at the credit memo. */
export function invoiceNotDraftMessage(status: string): string {
  if ((ISSUED_INVOICE_STATUSES as readonly string[]).includes(status)) return INVOICE_NOT_DRAFT_MESSAGE;
  if (status === "void") return "This invoice is void — it cannot be edited.";
  return `This invoice is ${status} — only a draft invoice can be edited.`;
}

/** Statuses of an invoice that has been issued to the customer (QBO: sent). Draft / proforma are edited directly. */
export const ISSUED_INVOICE_STATUSES = ["sent", "partial", "paid", "factored"] as const;

export type CreditMemoTargetRefusal = { code: 404 | 409 | 422; error: string; message: string; detail?: Record<string, unknown> };

export async function creditMemoTargetInvoiceRefusal(
  client: Db,
  input: { operatingCompanyId: string; invoiceId: string; customerId: string; amountCents: number; applyToInvoice: boolean }
): Promise<CreditMemoTargetRefusal | null> {
  const inv = (await client.query<{ status: string; customer_id: string; display_id: string | null; remaining: string }>(
    `SELECT i.status::text, i.customer_id::text, i.display_id,
            (i.total_cents - COALESCE(i.amount_paid_cents, 0)
              - COALESCE((SELECT sum(a.applied_cents) FROM accounting.credit_memo_applications a
                           WHERE a.invoice_id = i.id AND a.operating_company_id = i.operating_company_id AND a.voided_at IS NULL), 0))::text AS remaining
       FROM accounting.invoices i
      WHERE i.id = $1::uuid AND i.operating_company_id = $2::uuid
      LIMIT 1`,
    [input.invoiceId, input.operatingCompanyId]
  )).rows[0];
  if (!inv) return { code: 404, error: "invoice_not_found", message: "Invoice not found for this company." };
  if (inv.status === "void") {
    return { code: 409, error: "invoice_voided", message: `Invoice ${inv.display_id ?? ""} is void — a credit memo cannot be issued against it.` };
  }
  if (!(ISSUED_INVOICE_STATUSES as readonly string[]).includes(inv.status)) {
    return {
      code: 409,
      error: "invoice_not_issued",
      message: `Invoice ${inv.display_id ?? ""} is ${inv.status} — a draft is corrected by editing it; a credit memo corrects a SENT invoice.`,
    };
  }
  if (inv.customer_id !== input.customerId) {
    return {
      code: 422,
      error: "invoice_customer_mismatch",
      message: "The credit memo must be for the invoice's own customer.",
      detail: { invoice_customer_id: inv.customer_id, credit_memo_customer_id: input.customerId },
    };
  }
  const remaining = Number(inv.remaining);
  if (input.applyToInvoice && input.amountCents > remaining) {
    return {
      code: 422,
      error: "applied_cents_exceeds_invoice_balance",
      message: `The credit memo (${input.amountCents} cents) is more than invoice ${inv.display_id ?? ""}'s open balance (${Math.max(0, remaining)} cents). Apply up to the open balance, or leave it unapplied as customer credit.`,
      detail: { invoice_id: input.invoiceId, applied_cents: input.amountCents, invoice_remaining_cents: Math.max(0, remaining) },
    };
  }
  return null;
}

export type FactoredInvoiceLink = {
  factored: boolean;
  purchase_id: string | null;
  purchase_display_id: string | null;
  faro_invoice_number: string | null;
  factoring_advance_id: string | null;
  links_written: number;
};

/** The factoring position an invoice sits on: its live line on a posted, unvoided Faro purchase, and/or a legacy advance. */
export async function factoredInvoicePosition(client: Db, operatingCompanyId: string, invoiceId: string) {
  const row = (await client.query<{ purchase_id: string | null; purchase_display_id: string | null; faro_invoice_number: string | null; factoring_advance_id: string | null }>(
    `SELECT (SELECT p.id::text FROM accounting.factoring_purchase_lines l
               JOIN accounting.factoring_purchases p ON p.id = l.purchase_id AND p.status = 'posted' AND p.voided_at IS NULL
              WHERE l.invoice_id = i.id AND l.voided_at IS NULL ORDER BY p.purchase_date DESC LIMIT 1) AS purchase_id,
            (SELECT p.display_id FROM accounting.factoring_purchase_lines l
               JOIN accounting.factoring_purchases p ON p.id = l.purchase_id AND p.status = 'posted' AND p.voided_at IS NULL
              WHERE l.invoice_id = i.id AND l.voided_at IS NULL ORDER BY p.purchase_date DESC LIMIT 1) AS purchase_display_id,
            (SELECT l.faro_invoice_number FROM accounting.factoring_purchase_lines l
               JOIN accounting.factoring_purchases p ON p.id = l.purchase_id AND p.status = 'posted' AND p.voided_at IS NULL
              WHERE l.invoice_id = i.id AND l.voided_at IS NULL ORDER BY p.purchase_date DESC LIMIT 1) AS faro_invoice_number,
            CASE WHEN COALESCE(i.factoring_status, 'not_factored') <> 'not_factored' THEN i.factoring_advance_id::text END AS factoring_advance_id
       FROM accounting.invoices i
      WHERE i.id = $1::uuid AND i.operating_company_id = $2::uuid`,
    [invoiceId, operatingCompanyId]
  )).rows[0];
  return row ?? { purchase_id: null, purchase_display_id: null, faro_invoice_number: null, factoring_advance_id: null };
}

export async function recordFactoredInvoiceCreditMemoLink(
  client: Db,
  input: { operatingCompanyId: string; creditMemoId: string; invoiceId: string; journalEntryId: string | null; amountCents: number; userId: string }
): Promise<FactoredInvoiceLink> {
  const pos = await factoredInvoicePosition(client, input.operatingCompanyId, input.invoiceId);
  const factored = Boolean(pos.purchase_id || pos.factoring_advance_id);
  const out: FactoredInvoiceLink = { factored, ...pos, links_written: 0 };
  if (!factored) return out;
  if (input.journalEntryId) {
    const legs = (await client.query<{ id: string }>(
      `SELECT id::text FROM accounting.journal_entry_postings WHERE journal_entry_uuid = $1::uuid AND operating_company_id = $2::uuid`,
      [input.journalEntryId, input.operatingCompanyId]
    )).rows;
    for (const leg of legs) {
      if (pos.purchase_id) {
        await writeTransactionSourceLink(client as never, {
          operating_company_id: input.operatingCompanyId, journal_entry_posting_id: leg.id,
          linked_object_type: "factoring_purchase", linked_object_id: pos.purchase_id, relationship_role: "factored_invoice_credit_memo",
        });
        out.links_written += 1;
      }
      if (pos.factoring_advance_id) {
        await writeTransactionSourceLink(client as never, {
          operating_company_id: input.operatingCompanyId, journal_entry_posting_id: leg.id,
          linked_object_type: "factoring_advance", linked_object_id: pos.factoring_advance_id, relationship_role: "factored_invoice_credit_memo",
        });
        out.links_written += 1;
      }
    }
  }
  await appendCrudAudit(client as never, input.userId, "accounting.credit_memos.factored_invoice_credit_memo", {
    resource_type: "accounting.credit_memos", resource_id: input.creditMemoId, operating_company_id: input.operatingCompanyId,
    invoice_id: input.invoiceId, amount_cents: input.amountCents, journal_entry_id: input.journalEntryId,
    factoring_purchase_id: pos.purchase_id, factoring_purchase_display_id: pos.purchase_display_id,
    faro_invoice_number: pos.faro_invoice_number, factoring_advance_id: pos.factoring_advance_id,
    faro_side: "no Faro posting at credit-memo time (Faro moved no money; 2150 unchanged). Faro's cash-reserve short_pay row or the full-recourse chargeback posts Faro's side; the short-pay resolution links this credit memo instead of writing the shortfall down twice.",
  }, "warning", "ACCT-F11101");
  return out;
}
