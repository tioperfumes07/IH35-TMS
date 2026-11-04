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

// ROW 198 (D020) — ONE pool checkout per scoped request. The membership probe used to run through the
// (userId, companyId) overload, which opens its OWN withCurrentUser transaction: two pool.connect() +
// two BEGIN/SET ROLE/COMMIT round-trips per request. On a 5-connection pool a page that fans out 6-7
// requests (Fuel board) queued ~14 checkouts, and GET /api/v1/accounting/expense-category-map — 0.67 ms
// of SQL on prod — waited 8,831 ms for a connection. The probe now runs on the SAME client, inside the
// same transaction, under the same app.current_user_id GUC (fleet/shared.ts pattern), before any tenant SQL.
export async function withCompanyScope<T>(userId: string, operatingCompanyId: string, fn: (client: any) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await assertCompanyMembership(client, userId, operatingCompanyId);
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
 * invoice total minus applied non-void payments (payment-backed AND payment-less relief applications —
 * accounting.invoice_applied_cents_as_of, ACCT-F11103) minus applied non-void credit memos. Lives here as the
 * single source of truth so the manual create route (factoring-advances.routes.ts) and the delivery
 * auto-submit service (factoring/auto-submit-on-delivery.service.ts) compute the identical base — never
 * two formulas that can drift. `i` must be the aliased accounting.invoices row in the caller's query.
 */
export const INVOICE_PLEDGE_CENTS_SQL = `
GREATEST(
  COALESCE(i.total_cents, 0)
    - accounting.invoice_applied_cents_as_of(i.id, 'infinity'::date)
    - COALESCE((
        SELECT SUM(cma.applied_cents)
        FROM accounting.credit_memo_applications cma
        WHERE cma.invoice_id = i.id
          AND cma.operating_company_id = i.operating_company_id
          AND cma.voided_at IS NULL
      ), 0)
, 0)`;
