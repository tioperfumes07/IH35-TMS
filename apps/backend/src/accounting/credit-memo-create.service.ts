/**
 * The ONE credit-memo writer — moved verbatim out of POST /api/v1/accounting/credit-memos (owner 2026-11-27 13:50 CT, ScentsX sales
 * returns need it inside their own transaction). Inserts the credit memo, posts it through the posting engine (Dr the account /
 * Cr A/R), links a factored invoice's Faro legs, applies it to the related invoice when asked, and audits — on the caller's client,
 * so a failure anywhere rolls the whole caller back. No GL math here; the route and scentsx/returns.service.ts both call this.
 */
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
import { resolveCreditMemoDisplayId } from "./display-id.js";
import { postSourceTransactionInClientTx } from "./posting-engine.service.js";
import { applyCreditMemoToInvoicesInClientTx } from "./credit-memo-apply.service.js";
import { creditMemoTargetInvoiceRefusal, recordFactoredInvoiceCreditMemoLink } from "./credit-memo-from-invoice.service.js";

export const CREDIT_MEMO_REASONS = [
  "damage",
  "shortage",
  "rate_dispute",
  "duplicate_billing",
  "detention_dispute",
  "late_delivery",
  "missing_paperwork",
  "lumper_receipt_missing",
  "detention_denied",
  "factoring_dilution",
  "unknown_pending_backup",
  "billing_error_ours",
  "penalty_assessed",
  "agreed_concession",
  "quick_pay_discount",
  "unauthorized_deduction",
  "unearned_discount",
  "rate_underpaid",
  "other",
] as const;

export const createBodySchema = z.object({
  customer_id: z.string().trim().uuid(),
  issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  amount_cents: z.coerce.number().int().positive(),
  reason: z.enum(CREDIT_MEMO_REASONS),
  // ROUND 373.4 — the income (or contra-income) account this credit reduces. Required: a credit memo posts.
  account_id: z.string().trim().uuid(),
  notes: z.string().trim().max(2000).optional().nullable(),
  display_id: z.string().trim().min(1).max(40).optional(),
  // ACCT-F11101 (owner 11-04: "7-ok folow qb") — "Create credit memo" from a SENT invoice: the invoice it corrects
  // (related_invoice_id) and, like QuickBooks, whether it is applied to that invoice now (lowers its open balance) or left
  // unapplied as customer credit.
  related_invoice_id: z.string().trim().uuid().optional(),
  apply_to_invoice: z.boolean().optional(),
});


type Client = { query: (sql: string, values?: unknown[]) => Promise<{ rows: any[] }> }; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function createCreditMemoInClientTx(client: Client, { operatingCompanyId, userId, input }:
  { operatingCompanyId: string; userId: string; input: z.infer<typeof createBodySchema> }) {
    const customerRes = await client.query(
      `SELECT id FROM mdata.customers WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
      [input.customer_id, operatingCompanyId]
    );
    if (!customerRes.rows[0]) return { code: 404 as const, error: "customer_not_found" };

    const issueDate = input.issue_date ?? companyBusinessDate();

    // ROUND 373.4 — the account must be this company's, active and postable; never guessed, never defaulted.
    const acctRes = await client.query(
      `SELECT id FROM catalogs.accounts
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND deactivated_at IS NULL AND COALESCE(is_postable, true)
        LIMIT 1`,
      [input.account_id, operatingCompanyId]
    );
    if (!acctRes.rows[0]) return { code: 400 as const, error: "account_not_postable_for_company" };

    // ACCT-F11101 — a credit memo created FROM an invoice: issued (not draft / proforma / void), same customer, and when
    // applied now, no more than the invoice's open balance. Refused before anything is written.
    const relatedInvoiceId = input.related_invoice_id ?? null;
    const applyToInvoice = Boolean(relatedInvoiceId && input.apply_to_invoice);
    if (input.apply_to_invoice && !relatedInvoiceId) return { code: 400 as const, error: "apply_to_invoice_requires_related_invoice_id" };
    if (relatedInvoiceId) {
      const refusal = await creditMemoTargetInvoiceRefusal(client as never, {
        operatingCompanyId: operatingCompanyId, invoiceId: relatedInvoiceId, customerId: input.customer_id,
        amountCents: input.amount_cents, applyToInvoice,
      });
      if (refusal) return refusal;
    }

    // Canonical generator (same advisory-lock + MAX pattern nextVendorCreditDisplayId uses).
    const displayId = await resolveCreditMemoDisplayId(
      client,
      operatingCompanyId,
      new Date(`${issueDate}T00:00:00Z`),
      input.display_id
    );

    const insRes = await client.query(
      `INSERT INTO accounting.credit_memos
         (operating_company_id, customer_id, display_id, status, reason, issue_date, amount_cents, notes, created_by_user_id, account_id, related_invoice_id)
       VALUES ($1, $2, $3, 'issued', $4, $5, $6, $7, $8, $9::uuid, $10::uuid)
       RETURNING id, display_id, status, reason, issue_date, amount_cents, amount_applied_cents, (amount_cents - amount_applied_cents) AS amount_unapplied_cents, account_id, related_invoice_id`,
      [
        operatingCompanyId,
        input.customer_id,
        displayId,
        input.reason,
        issueDate,
        input.amount_cents,
        input.notes ?? null,
        userId,
        input.account_id,
        relatedInvoiceId,
      ]
    );
    const credit = insRes.rows[0];
    if (!credit) return { code: 500 as const, error: "credit_memo_create_failed" };

    // ROUND 373.4 — post on this transaction (Dr account / Cr A/R); a posting failure rolls the credit memo back.
    const posting = await postSourceTransactionInClientTx(
      client as never,
      { operating_company_id: operatingCompanyId, source_transaction_type: "credit_memo", source_transaction_id: String(credit.id) },
      { userId: userId }
    );
    const jeId = (posting as { journal_entry_id?: string | null })?.journal_entry_id ?? null;
    if (jeId) {
      await client.query(`UPDATE accounting.credit_memos SET journal_entry_id = $2::uuid WHERE id = $1::uuid`, [credit.id, jeId]);
    }
    credit.journal_entry_id = jeId;

    if (relatedInvoiceId) {
      // ACCT-F11101 — a factored invoice: the credit memo's legs are linked to the Faro purchase / advance (no Faro posting).
      credit.factoring = await recordFactoredInvoiceCreditMemoLink(client as never, {
        operatingCompanyId: operatingCompanyId, creditMemoId: String(credit.id), invoiceId: relatedInvoiceId,
        journalEntryId: jeId, amountCents: input.amount_cents, userId: userId,
      });
      if (applyToInvoice) {
        // THE apply (same transaction): the invoice's open balance drops by the credit memo, exactly like QBO.
        const applied = await applyCreditMemoToInvoicesInClientTx(client as never, {
          operatingCompanyId: operatingCompanyId, creditMemoId: String(credit.id), userId: userId,
          applications: [{ invoice_id: relatedInvoiceId, applied_cents: input.amount_cents, idempotency_key: `credit_memo_from_invoice:${String(credit.id)}` }],
        });
        if ("error" in applied) throw new Error(`credit_memo_apply_failed:${String(applied.error)}`);
        credit.amount_applied_cents = input.amount_cents;
        credit.amount_unapplied_cents = 0;
        credit.status = "applied";
      }
    }

    await appendCrudAudit(
      client,
      userId,
      "accounting.credit_memos.created",
      { resource_type: "accounting.credit_memos", resource_id: String(credit.id), display_id: displayId, customer_id: input.customer_id },
      "info",
      "ACCT-F5606"
    );

    return { code: 201 as const, data: credit };
}
