import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const deductionIdParamsSchema = z.object({ id: z.string().uuid() });
const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const holdBodySchema = z.object({
  hold_until_period: z.string(),
  reason: z.string().trim().min(10),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: any) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${companyId}'`);
    return fn(client);
  });
}

async function hasDeductionSchedule(client: any) {
  const res = await client.query(`SELECT to_regclass('driver_finance.deduction_schedule') IS NOT NULL AS ok`);
  return Boolean((res.rows[0] as { ok?: boolean } | undefined)?.ok);
}

export async function registerDriverFinanceDeductionRoutes(app: FastifyInstance) {
  app.patch("/api/v1/driver-finance/deduction-schedules/:id/hold", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = deductionIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = holdBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const result = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      if (!(await hasDeductionSchedule(client))) return { unavailable: true as const };
      const updateRes = await client.query(
        `
          UPDATE driver_finance.deduction_schedule
          SET is_held = true,
              hold_until_period = $2::date,
              hold_reason = $3,
              held_by_user_id = $4,
              updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [params.data.id, body.data.hold_until_period, body.data.reason, user.uuid]
      );
      if (updateRes.rowCount === 0) return { notFound: true as const };
      await appendCrudAudit(
        client,
        user.uuid,
        "driver_finance.deduction_held",
        {
          resource_type: "driver_finance.deduction_schedule",
          resource_id: params.data.id,
          hold_until_period: body.data.hold_until_period,
          reason: body.data.reason,
          held_by_user_id: user.uuid,
        },
        "info",
        "BT-3-DRIVER-FINANCE-REBUILD"
      );
      return { row: updateRes.rows[0] };
    });
    if ("unavailable" in result) return reply.code(501).send({ error: "driver_finance_schema_not_available" });
    if ("notFound" in result) return reply.code(404).send({ error: "deduction_schedule_not_found" });
    return result.row;
  });

  app.patch("/api/v1/driver-finance/deduction-schedules/:id/resume", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = deductionIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const result = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      if (!(await hasDeductionSchedule(client))) return { unavailable: true as const };
      const updateRes = await client.query(
        `
          UPDATE driver_finance.deduction_schedule
          SET is_held = false,
              hold_until_period = NULL,
              hold_reason = NULL,
              held_by_user_id = NULL,
              updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [params.data.id]
      );
      if (updateRes.rowCount === 0) return { notFound: true as const };
      await appendCrudAudit(
        client,
        user.uuid,
        "driver_finance.deduction_resumed",
        {
          resource_type: "driver_finance.deduction_schedule",
          resource_id: params.data.id,
          resumed_by_user_id: user.uuid,
        },
        "info",
        "BT-3-DRIVER-FINANCE-REBUILD"
      );
      return { row: updateRes.rows[0] };
    });
    if ("unavailable" in result) return reply.code(501).send({ error: "driver_finance_schema_not_available" });
    if ("notFound" in result) return reply.code(404).send({ error: "deduction_schedule_not_found" });
    return result.row;
  });

  app.get("/api/v1/driver-finance/drivers/:id/escrow-timeline", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = deductionIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const rows = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const existsRes = await client.query(`SELECT to_regclass('driver_finance.escrow_ledger') IS NOT NULL AS ok`);
      if (!Boolean((existsRes.rows[0] as { ok?: boolean } | undefined)?.ok)) return [];
      const res = await client.query(
        `SELECT * FROM driver_finance.escrow_ledger WHERE driver_id = $1 ORDER BY posted_at DESC LIMIT 200`,
        [params.data.id]
      );
      return res.rows;
    });

    return { timeline: rows };
  });
}
