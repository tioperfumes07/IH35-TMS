import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { validationError, withCompanyScope } from "../accounting/shared.js";
import { loadAbandonmentDefaults, upsertAbandonmentDefaults } from "./abandonment.service.js";

const listQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  status: z.enum(["pending", "approved", "disputed", "applied", "reversed", "all"]).optional(),
  driver_id: z.string().uuid().optional(),
});

const idParamsSchema = z.object({ id: z.string().uuid() });

const defaultsPutSchema = z.object({
  operating_company_id: z.string().uuid(),
  default_towing_cost_cents: z.number().int().min(0),
  default_deadhead_rate_per_mile_cents: z.number().int().min(0),
  default_replacement_premium_pct: z.number().min(0).max(100),
  require_approval_above_cents: z.number().int().min(0),
});

const reverseBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  reversal_reason: z.string().trim().min(1).max(2000),
});

const disputeBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function isOwnerOrAdmin(role: string) {
  return role === "Owner" || role === "Administrator";
}

export async function registerAbandonmentRoutes(app: FastifyInstance) {
  app.get("/api/v1/abandonment-chargebacks", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const q = parsed.data;

    const payload = await withCompanyScope(user.uuid, q.operating_company_id, async (client) => {
      const values: unknown[] = [q.operating_company_id];
      const where = [`operating_company_id = $1`];
      const statusFilter = q.status && q.status !== "all" ? q.status : null;
      if (statusFilter) {
        values.push(statusFilter);
        where.push(`status = $${values.length}`);
      }
      if (q.driver_id) {
        values.push(q.driver_id);
        where.push(`driver_id = $${values.length}`);
      }

      const rowsRes = await client.query(
        `
          SELECT *
          FROM driver_finance.abandonment_chargebacks
          WHERE ${where.join(" AND ")}
          ORDER BY abandonment_event_at DESC
          LIMIT 500
        `,
        values
      );
      return { abandonment_chargebacks: rowsRes.rows };
    });

    return payload;
  });

  app.post("/api/v1/abandonment-chargebacks/:id/approve", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = disputeBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const payload = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const updateRes = await client.query(
        `
          UPDATE driver_finance.abandonment_chargebacks
          SET status = 'approved',
              approval_user_id = $3::uuid,
              approved_at = now(),
              notes = CASE
                WHEN $4::text IS NULL THEN notes
                ELSE COALESCE(notes || E'\\n', '') || $4::text
              END,
              updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2
            AND status = 'pending'
          RETURNING *
        `,
        [params.data.id, body.data.operating_company_id, user.uuid, body.data.notes ?? null]
      );
      const updated = updateRes.rows[0];
      if (!updated) {
        const existing = await client.query(
          `SELECT id FROM driver_finance.abandonment_chargebacks WHERE id = $1 AND operating_company_id = $2 LIMIT 1`,
          [params.data.id, body.data.operating_company_id]
        );
        return existing.rows[0] ? { kind: "invalid_status" as const } : { kind: "missing" as const };
      }
      return { kind: "ok" as const, chargeback: updated };
    });

    if (payload.kind === "missing") return reply.code(404).send({ error: "chargeback_not_found" });
    if (payload.kind === "invalid_status") return reply.code(409).send({ error: "invalid_status" });
    return { abandonment_chargeback: payload.chargeback };
  });

  app.post("/api/v1/abandonment-chargebacks/:id/dispute", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = disputeBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const payload = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const existing = await client.query(
        `
          SELECT status
          FROM driver_finance.abandonment_chargebacks
          WHERE id = $1 AND operating_company_id = $2
          LIMIT 1
        `,
        [params.data.id, body.data.operating_company_id]
      );
      const row = existing.rows[0];
      if (!row) return { kind: "missing" as const };
      if (row.status !== "approved") return { kind: "invalid_status" as const, status: row.status };

      const updateRes = await client.query(
        `
          UPDATE driver_finance.abandonment_chargebacks
          SET status = 'disputed',
              notes = CASE
                WHEN $3::text IS NULL THEN notes
                ELSE COALESCE(notes || E'\\n', '') || $3
              END,
              updated_at = now()
          WHERE id = $1 AND operating_company_id = $2
          RETURNING *
        `,
        [params.data.id, body.data.operating_company_id, body.data.notes ?? null]
      );
      return { kind: "ok" as const, chargeback: updateRes.rows[0] };
    });

    if (payload.kind === "missing") return reply.code(404).send({ error: "chargeback_not_found" });
    if (payload.kind === "invalid_status") return reply.code(409).send({ error: "invalid_status", status: payload.status });
    return { abandonment_chargeback: payload.chargeback };
  });

  app.post("/api/v1/abandonment-chargebacks/:id/reverse", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!isOwnerOrAdmin(String(user.role ?? ""))) return reply.code(403).send({ error: "owner_admin_only" });

    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = reverseBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const payload = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const existing = await client.query(
        `
          SELECT status
          FROM driver_finance.abandonment_chargebacks
          WHERE id = $1 AND operating_company_id = $2
          LIMIT 1
        `,
        [params.data.id, body.data.operating_company_id]
      );
      const row = existing.rows[0];
      if (!row) return { kind: "missing" as const };
      if (row.status === "reversed") return { kind: "already_reversed" as const };

      const updateRes = await client.query(
        `
          UPDATE driver_finance.abandonment_chargebacks
          SET status = 'reversed',
              reversal_reason = $3,
              updated_at = now()
          WHERE id = $1 AND operating_company_id = $2
          RETURNING *
        `,
        [params.data.id, body.data.operating_company_id, body.data.reversal_reason]
      );
      return { kind: "ok" as const, chargeback: updateRes.rows[0] };
    });

    if (payload.kind === "missing") return reply.code(404).send({ error: "chargeback_not_found" });
    if (payload.kind === "already_reversed") return reply.code(409).send({ error: "already_reversed" });
    return { abandonment_chargeback: payload.chargeback };
  });

  app.get("/api/v1/abandonment-defaults", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const payload = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const defaults = await loadAbandonmentDefaults(client, parsed.data.operating_company_id);
      return {
        operating_company_id: parsed.data.operating_company_id,
        default_towing_cost_cents: Number(defaults.default_towing_cost_cents ?? 0),
        default_deadhead_rate_per_mile_cents: Number(defaults.default_deadhead_rate_per_mile_cents ?? 0),
        default_replacement_premium_pct: Number(defaults.default_replacement_premium_pct ?? 0),
        require_approval_above_cents: Number(defaults.require_approval_above_cents ?? 0),
      };
    });

    return payload;
  });

  app.put("/api/v1/abandonment-defaults", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!isOwnerOrAdmin(String(user.role ?? ""))) return reply.code(403).send({ error: "owner_admin_only" });

    const parsed = defaultsPutSchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const payload = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const row = await upsertAbandonmentDefaults(client, {
        operatingCompanyId: parsed.data.operating_company_id,
        default_towing_cost_cents: parsed.data.default_towing_cost_cents,
        default_deadhead_rate_per_mile_cents: parsed.data.default_deadhead_rate_per_mile_cents,
        default_replacement_premium_pct: parsed.data.default_replacement_premium_pct,
        require_approval_above_cents: parsed.data.require_approval_above_cents,
      });
      return {
        operating_company_id: parsed.data.operating_company_id,
        default_towing_cost_cents: Number(row.default_towing_cost_cents ?? 0),
        default_deadhead_rate_per_mile_cents: Number(row.default_deadhead_rate_per_mile_cents ?? 0),
        default_replacement_premium_pct: Number(row.default_replacement_premium_pct ?? 0),
        require_approval_above_cents: Number(row.require_approval_above_cents ?? 0),
      };
    });

    return payload;
  });
}
