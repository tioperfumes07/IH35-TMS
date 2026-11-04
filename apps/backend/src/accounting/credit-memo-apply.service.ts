/**
 * credit-memo-apply.service.ts — ACCT-F11101 (owner 11-04 08:44 CT: "7-ok folow qb").
 *
 * THE one apply of an A/R credit memo to invoices, moved VERBATIM out of credit-memos.routes.ts (POST /credit-memos/:id/apply)
 * so the "Create credit memo" from a SENT invoice can create AND apply in ONE transaction, exactly like QuickBooks. No SQL,
 * amount or check changed: applying moves the subledger only (credit_memo_applications + amount_applied_cents); the GL moved
 * once, when the credit memo posted at creation (Dr the reason account / Cr A/R through the posting engine).
 */
import { appendCrudAudit } from "../audit/crud-audit.js";

export type CreditMemoApplyClient = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, any>> }>;
};

export type CreditMemoApplyInput = {
  operatingCompanyId: string;
  creditMemoId: string;
  userId: string;
  applications: Array<{ invoice_id: string; applied_cents: number; idempotency_key?: string }>;
};

export async function applyCreditMemoToInvoicesInClientTx(client: CreditMemoApplyClient, input: CreditMemoApplyInput) {
  // ACCT-F5639 — FOR UPDATE, same row-lock pattern applied to the sibling /void endpoint below.
  // Closes two races at once: a concurrent /void call can no longer read this row unlocked while
  // this apply is mid-flight (which previously let a credit memo end up 'voided' with a live,
  // non-voided application row still standing), and two concurrent /apply calls can no longer
  // both read the same stale amount_unapplied_cents and jointly over-apply the credit beyond its
  // face amount across two different invoices.
  const creditRes = await client.query(
    `SELECT id, status, customer_id, (amount_cents - amount_applied_cents) AS amount_unapplied_cents
     FROM accounting.credit_memos
     WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1
     FOR UPDATE`,
    [input.creditMemoId, input.operatingCompanyId]
  );
  const credit = creditRes.rows[0];
  if (!credit) return { code: 404 as const, error: "credit_memo_not_found" };
  if (credit.status === "voided") return { code: 409 as const, error: "credit_memo_voided" };

  // ACCT-F5618 — resolve idempotent replays FIRST, before the over-apply check. A retried
  // request (double-click, client timeout+retry) with the same idempotency_key must return the
  // SAME success result, never a fresh INSERT and never a stale over-apply rejection computed
  // against a balance that ALREADY reflects the first successful call. Mirrors
  // settlement-posting.service.ts's own findExistingPostedJe pre-check pattern (look up by the
  // uq_credit_memo_app_idempotency unique index before inserting) rather than catching 23505 —
  // catching after the fact would still 500/409 on the retry instead of transparently replaying.
  const applicationIds: string[] = [];
  const newApplications: CreditMemoApplyInput["applications"] = [];
  for (const appReq of input.applications) {
    if (appReq.idempotency_key) {
      const existing = await client.query(
        `SELECT id FROM accounting.credit_memo_applications
          WHERE operating_company_id = $1::uuid AND idempotency_key = $2 AND voided_at IS NULL
          LIMIT 1`,
        [input.operatingCompanyId, appReq.idempotency_key]
      );
      if (existing.rows[0]) {
        applicationIds.push(String(existing.rows[0].id));
        continue;
      }
    }
    newApplications.push(appReq);
  }

  const totalApplying = newApplications.reduce((s, a) => s + a.applied_cents, 0);
  const unapplied = Number(credit.amount_unapplied_cents);
  if (totalApplying > unapplied) {
    return {
      code: 422 as const,
      error: "over_apply_refused",
      unapplied_cents: unapplied,
      requested_cents: totalApplying,
    };
  }

  for (const appReq of newApplications) {
    // customer_id on both sides is a direct mdata.customers.id uuid (unlike the AP side's
    // vendor_id, which bridges a canonical/QBO-mirror text space) — a plain equality check is
    // the correct, sufficient cross-customer guard here, no identity-set resolution needed.
    const invoiceRes = await client.query(
      `SELECT id, customer_id, total_cents, amount_paid_cents
         FROM accounting.invoices
        WHERE id = $1 AND operating_company_id = $2::uuid AND voided_at IS NULL LIMIT 1`,
      [appReq.invoice_id, input.operatingCompanyId]
    );
    const invoice = invoiceRes.rows[0];
    if (!invoice) return { code: 404 as const, error: `invoice_not_found:${appReq.invoice_id}` };

    if (String(invoice.customer_id) !== String(credit.customer_id)) {
      return {
        code: 422 as const,
        error: "invoice_customer_mismatch",
        detail: {
          invoice_id: appReq.invoice_id,
          invoice_customer_id: invoice.customer_id,
          credit_memo_customer_id: credit.customer_id,
        },
      };
    }

    // CAP THE APPLICATION AT THE INVOICE'S TRUE REMAINING BALANCE. amount_open_cents is a
    // GENERATED column (total_cents - amount_paid_cents, migration 0123) that has NO knowledge
    // of credit-memo applications — a naive check against it alone would let a credit memo
    // overshoot an invoice that a PRIOR credit-memo application had already partially covered.
    // Net off already-applied, non-voided credit-memo cents against this invoice, mirroring the
    // AP side's own "already-applied" ceiling fix (vendor-credits.routes.ts) exactly, so this
    // route ships with that class of bug already closed rather than repeating it here first.
    const alreadyAppliedRes = await client.query(
      `SELECT COALESCE(SUM(applied_cents), 0)::text AS applied_cents
         FROM accounting.credit_memo_applications
        WHERE invoice_id = $1
          AND operating_company_id = $2::uuid
          AND voided_at IS NULL`,
      [appReq.invoice_id, input.operatingCompanyId]
    );
    const invoiceRemainingCents =
      Number(invoice.total_cents ?? 0)
      - Number(invoice.amount_paid_cents ?? 0)
      - Number(alreadyAppliedRes.rows[0]?.applied_cents ?? 0);
    if (appReq.applied_cents > invoiceRemainingCents) {
      return {
        code: 422 as const,
        error: "applied_cents_exceeds_invoice_balance",
        detail: {
          invoice_id: appReq.invoice_id,
          applied_cents: appReq.applied_cents,
          invoice_remaining_cents: Math.max(0, invoiceRemainingCents),
        },
      };
    }

    const appRes = await client.query(
      `INSERT INTO accounting.credit_memo_applications
         (operating_company_id, credit_memo_id, invoice_id, applied_cents, applied_by_user_id, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        input.operatingCompanyId,
        input.creditMemoId,
        appReq.invoice_id,
        appReq.applied_cents,
        input.userId,
        appReq.idempotency_key ?? null,
      ]
    );
    applicationIds.push(String(appRes.rows[0]?.id ?? ""));
  }

  await client.query(
    `UPDATE accounting.credit_memos
     SET amount_applied_cents = amount_applied_cents + $2,
         status = CASE
           WHEN amount_applied_cents + $2 >= amount_cents THEN 'applied'
           ELSE status
         END
     WHERE id = $1`,
    [input.creditMemoId, totalApplying]
  );

  await appendCrudAudit(
    client as never,
    input.userId,
    "accounting.credit_memos.applied",
    {
      resource_type: "accounting.credit_memos",
      resource_id: input.creditMemoId,
      total_applied_cents: totalApplying,
      invoice_count: newApplications.length,
    },
    "info",
    "ACCT-F5606"
  );

  return { code: 200 as const, data: { applicationIds } };
}
