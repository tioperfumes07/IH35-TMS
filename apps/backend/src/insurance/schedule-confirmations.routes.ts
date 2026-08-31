// INS-SCHEDULE: Confirmation logging endpoint — append-only audit log.
// Owner ruling 2026-08-31: every confirm is logged (who, when, driver, load, truck).
// The confirm cannot be bypassed; every confirm is logged.

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const createConfirmationSchema = z.object({
  operating_company_id: z.string().uuid(),
  driver_id: z.string().uuid(),
  load_id: z.string().uuid().optional().nullable(),
  unit_id: z.string().uuid().optional().nullable(),
  policy_id: z.string().uuid().optional().nullable(),
  reason: z.string().optional().nullable(),
  confirmation_type: z.enum(["warning", "owner_override"]).default("warning"),
  rule_id: z.string().default("INS-SCHEDULE-NOT-ON-POLICY"),
});

const listConfirmationsSchema = z.object({
  operating_company_id: z.string().uuid(),
  driver_id: z.string().uuid().optional(),
  load_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

function canMutate(role: string) {
  return ["Owner", "Administrator", "Manager", "Dispatcher"].includes(role);
}

export async function registerScheduleConfirmationRoutes(app: FastifyInstance) {
  // Log a confirmation — append-only, cannot be bypassed.
  app.post("/api/v1/insurance/schedule-confirmations", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    if (!requireAuth(req, reply)) return reply;
    const user = req.user!;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });

    const parsed = createConfirmationSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", issues: parsed.error.flatten().fieldErrors });

    const body = parsed.data;
    await assertCompanyMembership(user.uuid, body.operating_company_id);

    const result = await withCurrentUser(user.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [body.operating_company_id]);
      const res = await client.query<{ id: string }>(
        `INSERT INTO insurance.schedule_confirmations
           (operating_company_id, driver_id, load_id, unit_id, policy_id, confirmed_by_user_id, reason, confirmation_type, rule_id)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7, $8, $9)
         RETURNING id::text`,
        [body.operating_company_id, body.driver_id, body.load_id ?? null, body.unit_id ?? null, body.policy_id ?? null,
         user.uuid, body.reason ?? null, body.confirmation_type, body.rule_id]
      );
      return res.rows[0];
    });

    return reply.code(201).send(result);
  });

  // List confirmations — read-only audit trail.
  app.get("/api/v1/insurance/schedule-confirmations", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    if (!requireAuth(req, reply)) return reply;
    const user = req.user!;

    const parsed = listConfirmationsSchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", issues: parsed.error.flatten().fieldErrors });

    const q = parsed.data;
    await assertCompanyMembership(user.uuid, q.operating_company_id);

    const result = await withCurrentUser(user.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [q.operating_company_id]);
      const conditions = ["operating_company_id = $1::uuid"];
      const params: unknown[] = [q.operating_company_id];
      let pIdx = 2;
      if (q.driver_id) { conditions.push(`driver_id = $${pIdx}::uuid`); params.push(q.driver_id); pIdx++; }
      if (q.load_id) { conditions.push(`load_id = $${pIdx}::uuid`); params.push(q.load_id); pIdx++; }
      const res = await client.query(
        `SELECT id::text, driver_id::text, load_id::text, unit_id::text, policy_id::text,
                confirmed_by_user_id::text, confirmed_at::text, reason, confirmation_type, rule_id, created_at::text
         FROM insurance.schedule_confirmations
         WHERE ${conditions.join(" AND ")}
         ORDER BY confirmed_at DESC
         LIMIT $${pIdx}::int`,
        [...params, q.limit]
      );
      return res.rows;
    });

    return reply.send({ confirmations: result });
  });
}
