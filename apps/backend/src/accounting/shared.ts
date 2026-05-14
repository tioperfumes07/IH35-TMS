import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
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

export async function withCompanyScope<T>(userId: string, operatingCompanyId: string, fn: (client: any) => Promise<T>) {
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
