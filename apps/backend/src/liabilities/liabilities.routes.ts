import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

const driverParamsSchema = z.object({
  driver_id: z.string().uuid(),
});

const holdBodySchema = z.object({
  reason: z.string().trim().min(3),
});

const ackRequestBodySchema = z.object({
  channel: z.enum(["whatsapp", "sms", "email"]),
  message: z.string().trim().min(3).max(2000),
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
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [operatingCompanyId]);
    return fn(client);
  });
}

export async function registerLiabilitiesRoutes(app: FastifyInstance) {
  app.get("/api/v1/liabilities/dashboard/kpis", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;
    const row = await withCompanyScope(user.uuid, companyId, async (client) => {
      const res = await client
        .query(
          `
            SELECT *
            FROM views.liabilities_dashboard_kpis
            WHERE operating_company_id = $1
            LIMIT 1
          `,
          [companyId]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      return res.rows[0] ?? null;
    });
    return (
      row ?? {
        operating_company_id: companyId,
        total_active_debt: 0,
        drivers_with_debt: 0,
        pending_acks: 0,
        equipment_loss_ytd: 0,
        civil_fines_ytd: 0,
      }
    );
  });

  app.get("/api/v1/liabilities/active", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;
    const rows = await withCompanyScope(user.uuid, companyId, async (client) => {
      const res = await client
        .query(
          `
            SELECT *
            FROM views.liabilities_active_with_context
            WHERE operating_company_id = $1
            ORDER BY created_at DESC
            LIMIT 500
          `,
          [companyId]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      return res.rows;
    });
    return { liabilities: rows };
  });

  app.get("/api/v1/liabilities/by-driver/:driver_id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = driverParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;
    const rows = await withCompanyScope(user.uuid, companyId, async (client) => {
      const res = await client
        .query(
          `
            SELECT *
            FROM views.liabilities_active_with_context
            WHERE operating_company_id = $1
              AND driver_id = $2
            ORDER BY created_at DESC
          `,
          [companyId, params.data.driver_id]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      return res.rows;
    });
    return { liabilities: rows };
  });

  app.get("/api/v1/liabilities/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;
    const detail = await withCompanyScope(user.uuid, companyId, async (client) => {
      const rowRes = await client
        .query(
          `
            SELECT *
            FROM views.liabilities_active_with_context
            WHERE id = $1
              AND operating_company_id = $2
            LIMIT 1
          `,
          [params.data.id, companyId]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      const liability = rowRes.rows[0];
      if (!liability) return null;
      const settlementsRes = await client
        .query(
          `
            SELECT settlement_id, amount, created_at
            FROM driver_finance.settlement_lines
            WHERE liability_id = $1
            ORDER BY created_at DESC
          `,
          [params.data.id]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      return { ...liability, settlement_history: settlementsRes.rows };
    });
    if (!detail) return reply.code(404).send({ error: "liability_not_found" });
    return detail;
  });

  app.post("/api/v1/liabilities/:id/send-ack-request", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = ackRequestBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const companyId = query.data.operating_company_id;
    const result = await withCompanyScope(user.uuid, companyId, async (client) => {
      const res = await client
        .query(
          `
            SELECT id, driver_id
            FROM driver_finance.driver_liabilities
            WHERE id = $1
              AND operating_company_id = $2
            LIMIT 1
          `,
          [params.data.id, companyId]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      const liability = res.rows[0];
      if (!liability) return null;

      await client.query(
        `
          INSERT INTO outbox.outbox_queue (aggregate_type, aggregate_id, event_type, payload)
          VALUES ($1, $2, $3, $4::jsonb)
        `,
        [
          "driver_finance.driver_liabilities",
          params.data.id,
          "liability.ack_request_sent",
          JSON.stringify({
            liability_id: params.data.id,
            driver_id: liability.driver_id,
            channel: body.data.channel,
            message: body.data.message,
          }),
        ]
      );
      await appendCrudAudit(
        client,
        user.uuid,
        "liability.ack_request_sent",
        {
          resource_type: "driver_finance.driver_liabilities",
          resource_id: params.data.id,
          operating_company_id: companyId,
          channel: body.data.channel,
        },
        "info",
        "BT-3-SAFETY-LIABILITIES-REBUILD"
      );
      return { ok: true, liability_id: params.data.id };
    });
    if (!result) return reply.code(404).send({ error: "liability_not_found" });
    return result;
  });

  app.patch("/api/v1/liabilities/:id/hold", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = holdBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const companyId = query.data.operating_company_id;

    const updated = await withCompanyScope(user.uuid, companyId, async (client) => {
      const res = await client
        .query(
          `
            UPDATE driver_finance.deduction_schedule
            SET hold_until_period = current_date + interval '14 days',
                hold_reason = $2,
                updated_at = now()
            WHERE liability_id = $1
            RETURNING id
          `,
          [params.data.id, body.data.reason]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      if (!res.rows[0]) return false;
      await appendCrudAudit(
        client,
        user.uuid,
        "liability.held",
        {
          resource_type: "driver_finance.driver_liabilities",
          resource_id: params.data.id,
          operating_company_id: companyId,
        },
        "info",
        "BT-3-SAFETY-LIABILITIES-REBUILD"
      );
      return true;
    });
    if (!updated) return reply.code(404).send({ error: "liability_not_found" });
    return { ok: true };
  });

  app.patch("/api/v1/liabilities/:id/resume", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const updated = await withCompanyScope(user.uuid, companyId, async (client) => {
      const res = await client
        .query(
          `
            UPDATE driver_finance.deduction_schedule
            SET hold_until_period = NULL,
                hold_reason = NULL,
                updated_at = now()
            WHERE liability_id = $1
            RETURNING id
          `,
          [params.data.id]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      if (!res.rows[0]) return false;
      await appendCrudAudit(
        client,
        user.uuid,
        "liability.resumed",
        {
          resource_type: "driver_finance.driver_liabilities",
          resource_id: params.data.id,
          operating_company_id: companyId,
        },
        "info",
        "BT-3-SAFETY-LIABILITIES-REBUILD"
      );
      return true;
    });
    if (!updated) return reply.code(404).send({ error: "liability_not_found" });
    return { ok: true };
  });

  app.patch("/api/v1/liabilities/:id/mark-paid-off", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (user.role !== "Owner") return reply.code(403).send({ error: "forbidden_owner_only" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const updated = await withCompanyScope(user.uuid, companyId, async (client) => {
      const res = await client
        .query(
          `
            UPDATE driver_finance.driver_liabilities
            SET current_balance = 0,
                paid_to_date = original_amount
            WHERE id = $1
              AND operating_company_id = $2
            RETURNING id
          `,
          [params.data.id, companyId]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      if (!res.rows[0]) return false;
      await appendCrudAudit(
        client,
        user.uuid,
        "liability.marked_paid_off",
        {
          resource_type: "driver_finance.driver_liabilities",
          resource_id: params.data.id,
          operating_company_id: companyId,
        },
        "info",
        "BT-3-SAFETY-LIABILITIES-REBUILD"
      );
      return true;
    });
    if (!updated) return reply.code(404).send({ error: "liability_not_found" });
    return { ok: true };
  });
}
