import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withCompanyScope<T>(
  userId: string,
  companyId: string,
  fn: (client: { query: (...args: unknown[]) => Promise<{ rows: unknown[] }> }) => Promise<T>
): Promise<T> {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [companyId]);
    return fn(client);
  });
}

const createRuleSchema = companyQuerySchema.extend({
  fault_code: z.string().trim().min(1),
  source: z.enum(["samsara", "j1939_dtc", "custom"]),
  description: z.string().trim().optional(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  auto_create_wo: z.boolean().default(false),
  suggested_shop_id: z.string().uuid().nullable().optional(),
  suggested_priority: z.enum(["routine", "urgent", "immediate"]).nullable().optional(),
  estimated_repair_hours: z.number().nullable().optional(),
});

const patchRuleSchema = createRuleSchema.partial().extend({
  operating_company_id: z.string().uuid(),
});

export async function registerFaultRulesRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/fault-rules", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const rows = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT *
          FROM maintenance.fault_code_severity_rules
          WHERE operating_company_id = $1::uuid
            AND active = true
          ORDER BY fault_code ASC
        `,
        [parsed.data.operating_company_id]
      );
      return res.rows;
    });
    return { rules: rows };
  });

  app.post("/api/v1/maintenance/fault-rules", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = createRuleSchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const b = parsed.data;

    const row = await withCompanyScope(user.uuid, b.operating_company_id, async (client) => {
      const res = await client.query(
        `
          INSERT INTO maintenance.fault_code_severity_rules (
            operating_company_id, fault_code, source, description, severity,
            auto_create_wo, suggested_shop_id, suggested_priority, estimated_repair_hours
          )
          VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::uuid, $8, $9)
          RETURNING *
        `,
        [
          b.operating_company_id,
          b.fault_code,
          b.source,
          b.description ?? null,
          b.severity,
          b.auto_create_wo,
          b.suggested_shop_id ?? null,
          b.suggested_priority ?? null,
          b.estimated_repair_hours ?? null,
        ]
      );
      return res.rows[0];
    });
    return reply.code(201).send(row);
  });

  app.patch("/api/v1/maintenance/fault-rules/:id", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const parsed = patchRuleSchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const b = parsed.data;

    const row = await withCompanyScope(user.uuid, b.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE maintenance.fault_code_severity_rules
          SET
            fault_code = COALESCE($3, fault_code),
            source = COALESCE($4, source),
            description = COALESCE($5, description),
            severity = COALESCE($6, severity),
            auto_create_wo = COALESCE($7, auto_create_wo),
            suggested_shop_id = COALESCE($8::uuid, suggested_shop_id),
            suggested_priority = COALESCE($9, suggested_priority),
            estimated_repair_hours = COALESCE($10, estimated_repair_hours)
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
            AND active = true
          RETURNING *
        `,
        [
          params.data.id,
          b.operating_company_id,
          b.fault_code ?? null,
          b.source ?? null,
          b.description ?? null,
          b.severity ?? null,
          b.auto_create_wo ?? null,
          b.suggested_shop_id ?? null,
          b.suggested_priority ?? null,
          b.estimated_repair_hours ?? null,
        ]
      );
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "rule_not_found" });
    return row;
  });

  app.post("/api/v1/maintenance/fault-rules/:id/archive", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const parsed = companyQuerySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const row = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE maintenance.fault_code_severity_rules
          SET active = false
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
          RETURNING id::text
        `,
        [params.data.id, parsed.data.operating_company_id]
      );
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "rule_not_found" });
    return { ok: true };
  });
}
