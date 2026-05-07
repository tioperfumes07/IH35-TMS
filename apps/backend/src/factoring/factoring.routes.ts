import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const recourseQuerySchema = companyQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(500).default(200),
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
    query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
  }) => Promise<T>
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${operatingCompanyId}'`);
    return fn(client);
  });
}

export async function registerFactoringRoutes(app: FastifyInstance) {
  app.get("/api/v1/factoring/summary", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const summary = await withCompanyScope(user.uuid, companyId, async (client) => {
      const res = await client
        .query(
          `
            SELECT *
            FROM views.factoring_summary
            WHERE operating_company_id = $1
            LIMIT 1
          `,
          [companyId]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      return res.rows[0] ?? null;
    });

    return (
      summary ?? {
        operating_company_id: companyId,
        active_factor_id: null,
        active_factor_name: "Faro Factoring",
        recourse_days: 90,
        reserve_balance: 0,
        chargeback_balance: 0,
        last_advance_at: null,
        active_factor_count: 0,
        single_factor_invariant_ok: true,
        mtd_advances_count: 0,
        mtd_advanced_total: 0,
      }
    );
  });

  app.get("/api/v1/factoring/recourse-pipeline", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = recourseQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const { operating_company_id: companyId, limit } = query.data;

    const invoices = await withCompanyScope(user.uuid, companyId, async (client) => {
      const res = await client
        .query(
          `
            SELECT *
            FROM views.factoring_recourse_at_risk
            WHERE operating_company_id = $1
            ORDER BY days_until_recourse_expiry ASC, factored_at DESC
            LIMIT $2
          `,
          [companyId, limit]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      return res.rows;
    });

    return { invoices };
  });

  app.get("/api/v1/factoring/chargebacks-fees", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const payload = await withCompanyScope(user.uuid, companyId, async (client) => {
      const historyRes = await client
        .query(
          `
            SELECT *
            FROM views.factoring_chargebacks_fees
            WHERE operating_company_id = $1
            ORDER BY created_at DESC
            LIMIT 500
          `,
          [companyId]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));

      const monthlyRes = await client
        .query(
          `
            SELECT
              statement_month,
              SUM(chargeback_amount)::numeric AS chargeback_total,
              SUM(factor_fee_amount)::numeric AS factor_fee_total
            FROM views.factoring_chargebacks_fees
            WHERE operating_company_id = $1
            GROUP BY statement_month
            ORDER BY statement_month DESC
            LIMIT 24
          `,
          [companyId]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));

      return {
        history: historyRes.rows,
        monthly_summary: monthlyRes.rows,
      };
    });

    return payload;
  });

  app.get("/api/v1/factoring/statements-settings", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const payload = await withCompanyScope(user.uuid, companyId, async (client) => {
      const rowsRes = await client
        .query(
          `
            SELECT *
            FROM views.factoring_statements_settings
            WHERE operating_company_id = $1
            ORDER BY statement_month DESC NULLS LAST
            LIMIT 60
          `,
          [companyId]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));

      const rows = rowsRes.rows;
      const current = rows[0] ?? {
        operating_company_id: companyId,
        active_factor_id: null,
        active_factor_name: "Faro Factoring",
        recourse_days: 90,
        active_factor_count: 0,
        single_factor_invariant_ok: true,
      };
      return {
        current,
        statements: rows.filter((row) => row.statement_month),
      };
    });

    return payload;
  });

  app.post("/api/v1/factoring/deactivate", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (user.role !== "Owner") return reply.code(403).send({ error: "forbidden_owner_only" });

    const body = companyQuerySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const companyId = body.data.operating_company_id;

    const result = await withCompanyScope(user.uuid, companyId, async (client) => {
      const relRes = await client.query<{ ok: boolean }>(`SELECT to_regclass('accounting.factoring_companies') IS NOT NULL AS ok`);
      if (!relRes.rows[0]?.ok) return { error: "missing_table" as const };

      const updateRes = await client.query<{ id: string; display_name: string | null }>(
        `
          UPDATE accounting.factoring_companies
          SET active = false
          WHERE operating_company_id = $1
            AND active = true
          RETURNING id, display_name
        `,
        [companyId]
      );
      const row = updateRes.rows[0];
      if (!row) return { error: "not_found" as const };

      await appendCrudAudit(
        client,
        user.uuid,
        "factoring.company.deactivated",
        {
          resource_type: "accounting.factoring_companies",
          resource_id: row.id,
          operating_company_id: companyId,
          factoring_company_name: row.display_name ?? "Faro Factoring",
        },
        "warning",
        "BT-3-FACTORING-REBUILD"
      );
      return { ok: true as const };
    });

    if ("error" in result) {
      if (result.error === "missing_table") return reply.code(409).send({ error: "factoring_company_table_unavailable" });
      if (result.error === "not_found") return reply.code(404).send({ error: "active_factoring_company_not_found" });
    }
    return { ok: true };
  });
}
