import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../../accounting/shared.js";

/** catalogs.driver_deduction_types.code — validated by DB FK after SETL-PICK-01 migration. */
const deductionTypeSchema = z.string().trim().min(1).max(128);
const statusSchema = z.enum(["active", "paused", "completed"]);

const createPolicySchema = z.object({
  driver_id: z.string().uuid(),
  deduction_type: deductionTypeSchema,
  total_owed_cents: z.coerce.number().int().positive(),
  max_per_settlement_cents: z.coerce.number().int().positive(),
  memo: z.string().trim().max(2000).optional(),
  source_ref: z.string().uuid().optional(),
});

const patchPolicySchema = z.object({
  status: statusSchema.optional(),
  max_per_settlement_cents: z.coerce.number().int().positive().optional(),
  memo: z.string().trim().max(2000).optional(),
});

const listQuerySchema = companyQuerySchema.extend({
  driver_id: z.string().uuid().optional(),
  status: statusSchema.optional(),
});

const idParamsSchema = z.object({ id: z.string().uuid() });

export async function registerAutoDeductionPolicyRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/auto-deductions/policies",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      // FAIL-DD1: project driver_name — EntityLink without a label falls back to raw UUID on the card title.
      const filters: string[] = ["p.operating_company_id = $1::uuid"];
      const values: unknown[] = [query.data.operating_company_id];
      if (query.data.driver_id) {
        values.push(query.data.driver_id);
        filters.push(`p.driver_id = $${values.length}::uuid`);
      }
      if (query.data.status) {
        values.push(query.data.status);
        filters.push(`p.status = $${values.length}`);
      }
      const res = await client.query(
        `
          SELECT
            p.*,
            -- DRV-MONEY-F7311: resolve_driver_label_same_company carries no deactivated_at/
            -- archived_at filter (unlike a plain mdata.drivers join would), so a deactivated or
            -- archived driver still resolves their durable historical name instead of silently
            -- rendering "Driver — not visible" for a policy row that is still real, company-bound
            -- history. Same pattern already locked for load/dispatch drivers and customers.
            mdata.resolve_driver_label_same_company(p.driver_id, p.operating_company_id) AS driver_name,
            -- AUTO-DEDUCTION-POLICY-HISTORY-NO-HUMAN-LABEL: the deduction-type join already existed
            -- (default_recovery_rail/may_draw_escrow/survives_separation), but never selected the
            -- one column a human reads — display_name — so the completed-policy history card had
            -- nothing but policy.id to label a row with.
            ddt.display_name AS deduction_type_display_name,
            ddt.default_recovery_rail,
            ddt.may_draw_escrow,
            ddt.survives_separation
          FROM driver_finance.auto_deduction_policies p
          LEFT JOIN catalogs.driver_deduction_types ddt
            ON ddt.operating_company_id = p.operating_company_id
           AND ddt.code = p.deduction_type
          WHERE ${filters.join(" AND ")}
          ORDER BY p.created_at DESC
        `,
        values
      );
      return res.rows;
    });

    return { rows };
  }
  );

  app.post(
    "/api/v1/auto-deductions/policies",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = createPolicySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const row = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          INSERT INTO driver_finance.auto_deduction_policies (
            operating_company_id,
            driver_id,
            deduction_type,
            total_owed_cents,
            max_per_settlement_cents,
            memo,
            source_ref,
            created_by_user_id,
            status
          )
          VALUES ($1::uuid,$2::uuid,$3,$4::bigint,$5::bigint,$6,$7::uuid,$8::uuid,'active')
          RETURNING *
        `,
        [
          query.data.operating_company_id,
          body.data.driver_id,
          body.data.deduction_type,
          body.data.total_owed_cents,
          body.data.max_per_settlement_cents,
          body.data.memo ?? null,
          body.data.source_ref ?? null,
          user.uuid,
        ]
      );
      return res.rows[0];
    });

    return reply.code(201).send({ policy: row });
  }
  );

  app.patch(
    "/api/v1/auto-deductions/policies/:id",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = patchPolicySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const row = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE driver_finance.auto_deduction_policies
          SET status = COALESCE($4, status),
              max_per_settlement_cents = COALESCE($5::bigint, max_per_settlement_cents),
              memo = COALESCE($6, memo),
              updated_at = now()
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
            AND status <> 'completed'
          RETURNING *
        `,
        [params.data.id, query.data.operating_company_id, user.uuid, body.data.status ?? null, body.data.max_per_settlement_cents ?? null, body.data.memo ?? null]
      );
      return res.rows[0] ?? null;
    });

    if (!row) return reply.code(404).send({ error: "policy_not_found" });
    return { policy: row };
  }
  );

  app.delete(
    "/api/v1/auto-deductions/policies/:id",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);

    const updated = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE driver_finance.auto_deduction_policies
          SET status = 'paused',
              updated_at = now()
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
            AND status = 'active'
          RETURNING id
        `,
        [params.data.id, query.data.operating_company_id]
      );
      return res.rows[0] ?? null;
    });

    if (!updated) return reply.code(404).send({ error: "policy_not_found_or_not_active" });
    return { ok: true };
  }
  );
}

export default fp(
  async (app) => {
    await registerAutoDeductionPolicyRoutes(app);
  },
  { name: "settlements.registerAutoDeductionPolicyRoutes" }
);
