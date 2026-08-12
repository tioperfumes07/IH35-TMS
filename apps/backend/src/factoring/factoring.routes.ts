import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { FACTORING_REPURCHASE_DEADLINE_DAYS } from "../accounting/factoring-posting/contract-config.js";
import { resolveCanonicalActiveFactor } from "../home/factoring-balance-invoice-linkage.service.js";

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
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);
    return fn(client);
  });
}

type RouteDbClient = {
  query: <T = Record<string, unknown>>(
    sql: string,
    values?: unknown[]
  ) => Promise<{ rows: T[] }>;
};

/** Operational summary/settings — same canonical Faro identity gate as GL + Home balance. */
async function resolveActiveFactor(client: RouteDbClient, companyId: string) {
  const identity = await resolveCanonicalActiveFactor(client, companyId);
  if (!identity.ok || !identity.vendorId) return null;
  return {
    id: identity.vendorId,
    vendor_name: identity.vendorName ?? null,
    profile_id: identity.factorProfileId ?? null,
  };
}

function withCanonicalFactorIdentity<T extends Record<string, unknown>>(
  payload: T,
  activeFactor: Awaited<ReturnType<typeof resolveActiveFactor>>
): T & { active_factor_profile_id: string | null } {
  return {
    ...payload,
    active_factor_id: activeFactor?.id ?? payload.active_factor_id ?? null,
    active_factor_name: activeFactor?.vendor_name ?? payload.active_factor_name ?? null,
    active_factor_profile_id: activeFactor?.profile_id ?? null,
  };
}

export async function registerFactoringRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/factoring/summary",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const summary = await withCompanyScope(user.uuid, companyId, async (client) => {
      const activeFactor = await resolveActiveFactor(client, companyId);
      const res = await client
        .query(
          `
            SELECT *
            FROM views.factoring_summary
            WHERE operating_company_id = $1::uuid
            LIMIT 1
          `,
          [companyId]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      return { row: res.rows[0] ?? null, activeFactor };
    });

    const fallback = {
      operating_company_id: companyId,
      active_factor_id: summary.activeFactor?.id ?? null,
      active_factor_name: summary.activeFactor?.vendor_name ?? null,
      recourse_days: FACTORING_REPURCHASE_DEADLINE_DAYS,
      reserve_balance: 0,
      chargeback_balance: 0,
      last_advance_at: null,
      active_factor_count: 0,
      single_factor_invariant_ok: true,
      mtd_advances_count: 0,
      mtd_advanced_total: 0,
    };
    return withCanonicalFactorIdentity(summary.row ?? fallback, summary.activeFactor);
  }
  );

  app.get(
    "/api/v1/factoring/recourse-pipeline",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = recourseQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const { operating_company_id: companyId, limit } = query.data;

    const invoices = await withCompanyScope(user.uuid, companyId, async (client) => {
      const res = await client
        .query(
          `
            SELECT
              rr.*,
              inv.customer_id
            FROM views.factoring_recourse_at_risk rr
            LEFT JOIN LATERAL (
              SELECT i.customer_id
              FROM accounting.invoices i
              WHERE i.factoring_advance_id = rr.factoring_advance_id
                AND i.operating_company_id = rr.operating_company_id
                AND i.status <> 'void'
              ORDER BY i.created_at DESC
              LIMIT 1
            ) inv ON true
            WHERE rr.operating_company_id = $1::uuid
            ORDER BY rr.days_until_recourse_expiry ASC, rr.factored_at DESC
            LIMIT $2
          `,
          [companyId, limit]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      return res.rows;
    });

    return { invoices };
  },
  );

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
            WHERE operating_company_id = $1::uuid
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
            WHERE operating_company_id = $1::uuid
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

  app.get(
    "/api/v1/factoring/statements-settings",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const payload = await withCompanyScope(user.uuid, companyId, async (client) => {
      const activeFactor = await resolveActiveFactor(client, companyId);
      const rowsRes = await client
        .query(
          `
            SELECT *
            FROM views.factoring_statements_settings
            WHERE operating_company_id = $1::uuid
            ORDER BY statement_month DESC NULLS LAST
            LIMIT 60
          `,
          [companyId]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));

      const rows = rowsRes.rows;
      const current = withCanonicalFactorIdentity(
        rows[0] ?? {
          operating_company_id: companyId,
          active_factor_id: activeFactor?.id ?? null,
          active_factor_name: activeFactor?.vendor_name ?? null,
          recourse_days: FACTORING_REPURCHASE_DEADLINE_DAYS,
          active_factor_count: 0,
          single_factor_invariant_ok: true,
        },
        activeFactor
      );
      return {
        current,
        statements: rows.filter((row) => row.statement_month),
      };
    });

    return payload;
  }
  );

  app.post("/api/v1/factoring/deactivate", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (user.role !== "Owner") return reply.code(403).send({ error: "forbidden_owner_only" });

    const body = companyQuerySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const companyId = body.data.operating_company_id;

    const result = await withCompanyScope(user.uuid, companyId, async (client) => {
      const relRes = await client.query<{ ok: boolean }>(
        `SELECT to_regclass('factoring.canonical_factor_agreements') IS NOT NULL AS ok`
      );
      if (!relRes.rows[0]?.ok) return { error: "missing_table" as const };

      const updateRes = await client.query<{ id: string; factor_vendor_id: string }>(
        `
          UPDATE factoring.canonical_factor_agreements
          SET
            effective_to = LEAST(COALESCE(effective_to, CURRENT_DATE), CURRENT_DATE),
            voided_at = now(),
            voided_by_user_id = $2
          WHERE tenant_id = $1
            AND agreement_code = 'FARO_FULL_RECOURSE_V1'
            AND voided_at IS NULL
            AND effective_from <= CURRENT_DATE
            AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
          RETURNING id, factor_vendor_id
        `,
        [companyId, user.uuid]
      );
      const row = updateRes.rows[0];
      if (!row) return { error: "not_found" as const };

      await appendCrudAudit(
        client,
        user.uuid,
        "factoring.canonical_agreement.deactivated",
        {
          resource_type: "factoring.canonical_factor_agreements",
          resource_id: row.id,
          operating_company_id: companyId,
          factor_vendor_id: row.factor_vendor_id,
        },
        "warning",
        "BT-3-FACTORING-REBUILD"
      );
      return { ok: true as const };
    });

    if ("error" in result) {
      if (result.error === "missing_table") {
        return reply.code(409).send({
          error: "canonical_factoring_agreement_unavailable",
          message: "The retired factoring-company profile cannot be deactivated. Apply the canonical factoring agreement path first.",
        });
      }
      if (result.error === "not_found") return reply.code(404).send({ error: "active_canonical_factoring_agreement_not_found" });
    }
    return { ok: true };
  });
}
