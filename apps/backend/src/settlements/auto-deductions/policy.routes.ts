import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../../accounting/shared.js";

const deductionTypeSchema = z.enum(["damage", "cash_advance", "repair", "fine", "fuel_advance", "other"]);
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
  app.get("/api/v1/auto-deductions/policies", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const filters: string[] = ["operating_company_id = $1::uuid"];
      const values: unknown[] = [query.data.operating_company_id];
      if (query.data.driver_id) {
        values.push(query.data.driver_id);
        filters.push(`driver_id = $${values.length}::uuid`);
      }
      if (query.data.status) {
        values.push(query.data.status);
        filters.push(`status = $${values.length}`);
      }
      const res = await client.query(
        `
          SELECT *
          FROM driver_finance.auto_deduction_policies
          WHERE ${filters.join(" AND ")}
          ORDER BY created_at DESC
        `,
        values
      );
      return res.rows;
    });

    return { rows };
  });

  app.post("/api/v1/auto-deductions/policies", async (req, reply) => {
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
  });

  app.patch("/api/v1/auto-deductions/policies/:id", async (req, reply) => {
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
  });

  app.delete("/api/v1/auto-deductions/policies/:id", async (req, reply) => {
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
  });
}

export default fp(
  async (app) => {
    await registerAutoDeductionPolicyRoutes(app);
  },
  { name: "settlements.registerAutoDeductionPolicyRoutes" }
);
