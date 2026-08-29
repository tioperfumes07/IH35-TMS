import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { enqueueOutboxEvent } from "../outbox/enqueue-outbox-event.js";

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
  if (!requireAuth(req, reply)) return reply;
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

// LIAB-F9927-SILENT-CATCH-SWEEP: every route below used to .catch(() => ({ rows: [] })) its own
// query — the same fake-empty-200 class as the banking/factoring/settlements sweep (BANK-F9514-9522).
// Four GET reads returned an honest-looking empty list / $0-KPI row on a real DB failure; three PATCH
// mutations (hold/resume/mark-paid-off) went further and turned a genuine UPDATE failure into a 404
// "liability_not_found" — an operator retrying a hold/resume/payoff on a real, existing liability had
// no way to tell "this liability doesn't exist" from "the write just failed". driver_finance.* and
// views.liabilities_* are foundational, not conditionally-created tables (no relationExists() guard
// ever gated any of these queries), so a caught error here was always a real failure, never an
// expected "table doesn't exist yet" case. Letting the query throw is the fix — Fastify's own async
// error handling turns the uncaught rejection into a proper 500, not a false-positive empty/not-found.
export async function registerLiabilitiesRoutes(app: FastifyInstance) {
  app.get("/api/v1/liabilities/dashboard/kpis", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
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
            WHERE operating_company_id = $1::uuid
            LIMIT 1
          `,
          [companyId]
        );
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

  app.get("/api/v1/liabilities/active", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
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
            WHERE operating_company_id = $1::uuid
            ORDER BY created_at DESC
            LIMIT 500
          `,
          [companyId]
        );
      return res.rows;
    });
    return { liabilities: rows };
  });

  app.get("/api/v1/liabilities/by-driver/:driver_id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
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
            WHERE operating_company_id = $1::uuid
              AND driver_id = $2
            ORDER BY created_at DESC
          `,
          [companyId, params.data.driver_id]
        );
      return res.rows;
    });
    return { liabilities: rows };
  });

  app.get("/api/v1/liabilities/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
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
              AND operating_company_id = $2::uuid
            LIMIT 1
          `,
          [params.data.id, companyId]
        );
      const liability = rowRes.rows[0];
      if (!liability) return null;
      // FIX (Law §9 2026-07-22, GAP not patch — same root cause as cash-advances.routes.ts GET /:id):
      // driver_finance.settlement_lines has never had a liability_id column (0191 create + 202607430000
      // additive columns only added load_id/source_table/source_reference_id/source_id, none
      // backfilled) — the old query's SQL error was silently swallowed by .catch to []. The canonical
      // deduction ledger (driver_finance.driver_settlement_deductions) has driver_id but no column
      // linking back to a specific liability id (deductions.service.ts "TODO B4-B" gap), so this can
      // only show driver-level settlement-deduction history, not "deductions that repaid THIS
      // liability" exactly. REMAINING/HOLD: exact per-liability attribution needs the deduction-cap
      // migration block — separate financial PR (owner + CPA review), not invented here.
      const settlementsRes = await client
        .query(
          `
            SELECT applied_to_settlement_id AS settlement_id,
                   (amount_cents::numeric / 100) AS amount,
                   created_at
            FROM driver_finance.driver_settlement_deductions
            WHERE driver_id = $1
              AND applied_to_settlement_id IS NOT NULL
            ORDER BY created_at DESC
          `,
          [liability.driver_id]
        );
      return { ...liability, settlement_history: settlementsRes.rows, settlement_history_is_driver_level: true };
    });
    if (!detail) return reply.code(404).send({ error: "liability_not_found" });
    return detail;
  });

  app.post("/api/v1/liabilities/:id/send-ack-request", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
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
              AND operating_company_id = $2::uuid
            LIMIT 1
          `,
          [params.data.id, companyId]
        );
      const liability = res.rows[0];
      if (!liability) return null;

      await enqueueOutboxEvent(
        client,
        "liability.ack_request_sent",
        { aggregate_type: "driver_finance.driver_liabilities", aggregate_id: params.data.id },
        {
          liability_id: params.data.id,
          driver_id: liability.driver_id,
          // Required by the consumer: every notification is entity-scoped.
          operating_company_id: companyId,
          channel: body.data.channel,
          message: body.data.message,
        }
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

  app.patch("/api/v1/liabilities/:id/hold", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
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
        );
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

  app.patch("/api/v1/liabilities/:id/resume", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
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
        );
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

  app.patch("/api/v1/liabilities/:id/mark-paid-off", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
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
              AND operating_company_id = $2::uuid
            RETURNING id
          `,
          [params.data.id, companyId]
        );
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
