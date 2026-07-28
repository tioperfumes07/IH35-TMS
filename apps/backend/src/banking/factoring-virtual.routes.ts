import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: {
    query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
  }) => Promise<T>
) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [operatingCompanyId]);
    return fn(client);
  });
}

export async function registerBankingFactoringVirtualRoutes(app: FastifyInstance) {
  app.get("/api/v1/banking/factoring-virtual", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const summary = await withCompanyScope(user.uuid, companyId, async (client) => {
      const relation = await client.query<{ exists: boolean }>(
        `SELECT to_regclass('views.factoring_balance_invoice_linkage') IS NOT NULL AS exists`
      );
      if (!relation.rows[0]?.exists) return { error: "missing_linkage_view" as const };

      const res = await client.query(
        `
          SELECT
            f.factor_vendor_id::text AS id,
            COALESCE(v.vendor_name, 'Factoring') AS display_name,
            (SUM(f.reserve_receivable_signed_cents)::numeric / 100)::numeric AS reserve_balance,
            (SUM(f.outstanding_liability_signed_cents)::numeric / 100)::numeric AS chargeback_balance,
            NULL::timestamptz AS last_advance_at
          FROM views.factoring_balance_invoice_linkage f
          LEFT JOIN mdata.vendors v
            ON v.id = f.factor_vendor_id
           AND v.operating_company_id = f.operating_company_id
          WHERE f.operating_company_id = $1
          GROUP BY f.factor_vendor_id, v.vendor_name
          ORDER BY COALESCE(v.vendor_name, 'Factoring')
        `,
        [companyId]
      );
      return { rows: res.rows };
    });
    if ("error" in summary) {
      return reply.code(503).send({
        error: "factoring_balance_linkage_unavailable",
        migration: "202607600000_factoring_balance_invoice_linkage.sql",
      });
    }
    return { companies: summary.rows };
  });

  app.get("/api/v1/banking/factoring-virtual/timeline", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const timeline = await withCompanyScope(user.uuid, companyId, async (client) => {
      const res = await client
        .query(
          `
            SELECT
              fa.id::text AS id,
              fa.display_id,
              fa.status,
              fa.advance_amount_cents,
              fa.created_at::text AS created_at,
              fa.advanced_at::text AS advanced_at
            FROM accounting.factoring_advances fa
            WHERE fa.operating_company_id = $1
              AND fa.status IS DISTINCT FROM 'voided'
            ORDER BY COALESCE(fa.advanced_at, fa.created_at) DESC NULLS LAST
            LIMIT 25
          `,
          [companyId]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      return res.rows;
    });
    return { timeline };
  });
}
