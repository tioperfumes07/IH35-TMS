import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { requireAuth } from "../auth/session-middleware.js";
import { sendZodValidation } from "../lib/zod-http-error.js";

export const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

export function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export function validationError(reply: FastifyReply, error: z.ZodError) {
  return sendZodValidation(reply, error);
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

export async function withCompanyScope<T>(userId: string, operatingCompanyId: string, fn: (client: any) => Promise<T>) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    return fn(client);
  });
}

/**
 * COMPLICATED-PRINT-F09 — invoice/bill/WO print without ?operating_company_id.
 * accounting.* / maintenance.work_orders RLS is AND-gated on app.operating_company_id with
 * no lucia branch. A bare SELECT by UUID under withCurrentUser therefore returns 0 and the
 * handler lies "needs a real UUID". Walk membership companies and set the GUC per hop.
 */
export async function resolvePrintOperatingCompanyId(
  userId: string,
  lookupSql: string,
  rowId: string
): Promise<string | null> {
  if (!lookupSql.includes("WHERE id = $1::uuid")) {
    throw new Error("resolvePrintOperatingCompanyId lookupSql must bind row id as $1::uuid");
  }
  return withCurrentUser(userId, async (client) => {
    const companies = await client.query<{ cid: string }>(`SELECT org.user_accessible_company_ids() AS cid`);
    for (const row of companies.rows) {
      const cid = row.cid;
      if (!cid) continue;
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [cid]);
      const found = await client.query(lookupSql, [rowId]);
      const op = found.rows[0]?.operating_company_id as string | undefined;
      if (op) return String(op);
    }
    return null;
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
