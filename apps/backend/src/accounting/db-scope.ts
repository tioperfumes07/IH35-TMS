import { withCurrentUser } from "../auth/db.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

/**
 * 443.191 — the NON-HTTP half of accounting/shared.ts: what service code (engines, writers, posters, workers) needs
 * from it — the company-scoped transaction, the invoice-totals recompute and the factoring pledge SQL. shared.ts is
 * the route-helper module (currentAuthUser -> requireAuth -> session-middleware -> session-provider -> lucia), so a
 * service importing it dragged the auth/session stack into every caller's import graph: expense-writer.service.ts
 * -> shared.ts -> lucia broke 13 bank-recon test files + lumper-cash-advance-split at import. Service code imports
 * from HERE; shared.ts re-exports these for route code (one definition each). Guard:
 * scripts/verify-service-code-no-route-helper-import.mjs.
 */

export async function withCompanyScope<T>(userId: string, operatingCompanyId: string, fn: (client: any) => Promise<T>) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    return fn(client);
  });
}

export async function recomputeInvoiceTotals(client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> }, invoiceId: string) {
  const totalsRes = await client.query(
    `
      SELECT
        COALESCE(SUM(CASE WHEN line_type <> 'tax' THEN line_total_cents ELSE 0 END), 0)::bigint AS subtotal_cents,
        COALESCE(SUM(CASE WHEN line_type = 'tax' THEN line_total_cents ELSE 0 END), 0)::bigint AS tax_cents
      FROM accounting.invoice_lines
      WHERE invoice_id = $1
        -- ACCT-F156: void-not-delete means a soft-deleted line STAYS in this table carrying its
        -- original amount. Without this predicate, soft-deleting an invoice line does not reduce the
        -- invoice total, and the header silently disagrees with ACCT-F146's tie-out, which DOES filter
        -- soft_deleted_at. Zero soft-deleted lines exist today (21,213 of 21,213 live on prod), so this
        -- has never produced a wrong number -- it is armed for the first soft-delete.
        AND soft_deleted_at IS NULL
    `,
    [invoiceId]
  );
  const subtotal = Number(totalsRes.rows[0]?.subtotal_cents ?? 0);
  const tax = Number(totalsRes.rows[0]?.tax_cents ?? 0);
  const total = subtotal + tax;
  await client.query(
    `
      UPDATE accounting.invoices
      SET subtotal_cents = $2,
          tax_cents = $3,
          total_cents = $4,
          updated_at = now()
      WHERE id = $1
    `,
    [invoiceId, subtotal, tax, total]
  );
  return { subtotal_cents: subtotal, tax_cents: tax, total_cents: total };
}

/**
 * FACT-DELIVERED-AUTO — the open-AR "pledge" a factoring advance is faced/reserved/feed against:
 * invoice total minus applied non-void payments minus applied non-void credit memos. Lives here as the
 * single source of truth so the manual create route (factoring-advances.routes.ts) and the delivery
 * auto-submit service (factoring/auto-submit-on-delivery.service.ts) compute the identical base — never
 * two formulas that can drift. `i` must be the aliased accounting.invoices row in the caller's query.
 */
export const INVOICE_PLEDGE_CENTS_SQL = `
GREATEST(
  COALESCE(i.total_cents, 0)
    - COALESCE((
        SELECT SUM(COALESCE(pa.amount_cents, 0))
        FROM accounting.payment_applications pa
        JOIN accounting.payments p
          ON p.id = pa.payment_id
         AND p.operating_company_id = i.operating_company_id
        WHERE pa.invoice_id = i.id
          AND pa.operating_company_id = i.operating_company_id
          AND p.voided_at IS NULL
          AND pa.unapplied_at IS NULL
      ), 0)
    - COALESCE((
        SELECT SUM(cma.applied_cents)
        FROM accounting.credit_memo_applications cma
        WHERE cma.invoice_id = i.id
          AND cma.operating_company_id = i.operating_company_id
          AND cma.voided_at IS NULL
      ), 0)
, 0)`;
