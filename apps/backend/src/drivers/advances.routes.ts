import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

// Reverse drill-through: list cash advances for a specific driver, so the Driver detail page can
// show "everything linked to this driver" (total-connectivity). Read-only SELECT, company-scoped.
// Reads driver_finance.driver_advances (the per-advance transaction rows — driver_finance.driver_advance_accounts
// is a DIFFERENT table: one row per driver holding the linked GL account id, not a list of advances).
// Both are returned: `account` (the GL sub-account link, if provisioned) + `advances` (the transaction history).

const paramsSchema = z.object({ id: z.string().uuid() });
const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  status: z.enum(["outstanding", "paid_off", "written_off", "cancelled"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

function officeAuth(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function registerDriverAdvancesRoutes(app: FastifyInstance) {
  app.get("/api/v1/drivers/:id/advances", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = officeAuth(req, reply);
    if (!authUser) return reply;

    const params = paramsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const { id: driverId } = params.data;
    const { operating_company_id: operatingCompanyId, status, limit, offset } = query.data;

    await assertCompanyMembership(authUser.uuid, operatingCompanyId);

    const result = await withCurrentUser(authUser.uuid, async (rawClient) => {
      const client = rawClient as Queryable;
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);

      // DRVFIN-F6169 — a strict operating_company_id equality here false-404'd a driver with an
      // active canonical authorization at the selected company but a DIFFERENT home company, even
      // though the advance/account rows below are correctly selected-company scoped and would
      // return real data. Mirrors the same home-OR-active-authorization fallback drivers.routes.ts
      // already uses for its own GET /:id (driver_company_authorizations, is_authorized=true,
      // deactivated_at IS NULL) — the dca RLS SELECT policy already restricts rows to
      // user-accessible companies, so this cannot widen visibility beyond that.
      const driverRes = await client.query<{ id: string }>(
        `
          SELECT id FROM mdata.drivers
          WHERE id = $1::uuid
            AND (
              operating_company_id = $2::uuid
              OR EXISTS (
                SELECT 1 FROM mdata.driver_company_authorizations dca
                WHERE dca.driver_id = mdata.drivers.id
                  AND dca.company_id = $2::uuid
                  AND dca.is_authorized = true
                  AND dca.deactivated_at IS NULL
              )
            )
          LIMIT 1
        `,
        [driverId, operatingCompanyId]
      );
      if (!driverRes.rows[0]) return { notFound: true as const };

      const accountRes = await client.query(
        `
          SELECT
            aa.coa_account_id,
            a.account_number,
            a.account_name,
            aa.is_active
          FROM driver_finance.driver_advance_accounts aa
          LEFT JOIN catalogs.accounts a ON a.id = aa.coa_account_id
                                        AND a.operating_company_id = $1::uuid
          WHERE aa.operating_company_id = $1::uuid
            AND aa.driver_id = $2::uuid
          LIMIT 1
        `,
        [operatingCompanyId, driverId]
      );

      const values: unknown[] = [operatingCompanyId, driverId];
      const where = ["operating_company_id = $1::uuid", "driver_id = $2::uuid"];
      if (status) {
        values.push(status);
        where.push(`status = $${values.length}`);
      }
      const countRes = await client.query<{ cnt: number }>(
        `SELECT count(*)::int AS cnt FROM driver_finance.driver_advances WHERE ${where.join(" AND ")}`,
        values
      );
      values.push(limit, offset);
      const rowsRes = await client.query(
        `
          SELECT
            id, display_id, driver_id, liability_id, amount, purpose,
            disbursement_method, disbursement_status, recipient_type, recipient_name,
            linked_bill_id, linked_bill_payment_id, linked_bank_txn_id, linked_driver_bill_id,
            load_id, disbursement_reference, requires_owner_approval,
            disbursed_at, posting_date, status, outstanding_balance, memo,
            created_at, updated_at
          FROM driver_finance.driver_advances
          WHERE ${where.join(" AND ")}
          ORDER BY created_at DESC
          LIMIT $${values.length - 1} OFFSET $${values.length}
        `,
        values
      );

      return {
        notFound: false as const,
        account: accountRes.rows[0] ?? null,
        rows: rowsRes.rows,
        total: Number(countRes.rows[0]?.cnt ?? 0),
      };
    });

    if (result.notFound) return reply.code(404).send({ error: "driver_not_found" });

    return reply.send({
      driver_id: driverId,
      account: result.account,
      advances: result.rows,
      total_count: result.total,
      limit,
      offset,
    });
  });
}
