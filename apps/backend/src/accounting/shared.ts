import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { sendZodValidation } from "../lib/zod-http-error.js";

// Service-safe definitions (no HTTP / session imports) live in db-scope.ts; re-exported here for route code.
export { INVOICE_PLEDGE_CENTS_SQL, recomputeInvoiceTotals, withCompanyScope } from "./db-scope.js";

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
      // membership-scope-exempt: cid comes from org.user_accessible_company_ids() membership list.
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [cid]);
      const found = await client.query(lookupSql, [rowId]);
      const op = found.rows[0]?.operating_company_id as string | undefined;
      if (op) return String(op);
    }
    return null;
  });
}

