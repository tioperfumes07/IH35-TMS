/**
 * Alert rules routes — W2B-ALERT-RULES-PROFILES (Fastify)
 * Three QBO profile pages: App, Driver, Broker + broker approval queue.
 * NON-FINANCIAL (config only; engines that ACT ship in Waves 3/4).
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

const ProfileSchema = z.object({
  profile_type: z.enum(["app", "driver", "broker"]),
  name: z.string().min(1).max(100),
});

const RuleSchema = z.object({
  profile_id: z.string().uuid(),
  trigger_event: z.string().min(1),
  audience: z.enum(["office_user", "driver", "broker"]),
  channel: z.enum(["app", "push", "sms", "email", "alarm"]),
  ping_count: z.coerce.number().int().min(1).default(1),
  reping_cadence: z.enum(["none", "daily"]).optional(),
  cutoff_time: z.string().optional(),  // HH:MM format
  force_ack: z.boolean().default(false),
  force_alarm: z.boolean().default(false),
  auto_send: z.boolean().default(false),
  hold_for_review: z.boolean().default(true),
  escalate_to_user_id: z.string().uuid().optional(),
  escalate_after_missed: z.coerce.number().int().min(1).default(2),
  conditions: z.record(z.string(), z.unknown()).default({}),
});

const QueueDecisionSchema = z.object({
  // SECURITY (G2-1): operating_company_id MUST be uuid-validated here. It is used to scope the
  // update AND is bound into the events.log_event audit-spine call below — an unvalidated value
  // previously reached that call via string interpolation (SQL injection). Validate at the edge.
  operating_company_id: z.string().uuid(),
  status: z.enum(["approved", "rejected"]),
  edited_message: z.string().optional(),
});

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
  return req.user!;
}

export default async function alertRoutes(fastify: FastifyInstance) {
  // GET /alert/profiles — list profiles
  fastify.get("/profiles", async (request, reply) => {
    const user = authUser(request, reply);
    if (!user) return;

    const { operating_company_id } = z.object({ operating_company_id: z.string().uuid() }).parse(request.query);
    // G2-2: uuid-valid is not membership — assert the caller belongs to this company before scoping RLS to it.
    await assertCompanyMembership(user.uuid, operating_company_id);

    return withCurrentUser(user.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operating_company_id]);
      const result = await (client as Queryable).query(
        `SELECT * FROM alerts.profile WHERE operating_company_id = $1::uuid AND is_active = true ORDER BY profile_type, name`,
        [operating_company_id]
      );
      return { profiles: result.rows };
    });
  });

  // POST /alert/profiles — create profile
  fastify.post("/profiles", async (request, reply) => {
    const user = authUser(request, reply);
    if (!user) return;

    const input = ProfileSchema.parse(request.body);
    const ocId = z.string().uuid().parse((request.body as { operating_company_id: string }).operating_company_id);
    // G2-2: uuid-valid is not membership — assert the caller belongs to this company before writing under it.
    await assertCompanyMembership(user.uuid, ocId);

    return withCurrentUser(user.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [ocId]);
      const sql = `
        INSERT INTO alerts.profile (operating_company_id, profile_type, name, created_by_user_id)
        VALUES ($1, $2, $3, $4) RETURNING *
      `;
      const result = await (client as Queryable).query(sql, [ocId, input.profile_type, input.name, user.uuid]);
      reply.status(201);
      return { profile: result.rows[0] };
    });
  });

  // GET /alert/rules — list rules for a profile
  fastify.get("/rules", async (request, reply) => {
    const user = authUser(request, reply);
    if (!user) return;

    const { profile_id, operating_company_id } = z.object({
      profile_id: z.string().uuid(),
      operating_company_id: z.string().uuid(),
    }).parse(request.query);
    // G2-2: uuid-valid is not membership — assert the caller belongs to this company before scoping RLS to it.
    await assertCompanyMembership(user.uuid, operating_company_id);

    return withCurrentUser(user.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operating_company_id]);
      const result = await (client as Queryable).query(
        `SELECT * FROM alerts.rule WHERE profile_id = $1 AND is_active = true ORDER BY created_at`,
        [profile_id]
      );
      return { rules: result.rows };
    });
  });

  // POST /alert/rules — create rule
  fastify.post("/rules", async (request, reply) => {
    const user = authUser(request, reply);
    if (!user) return;

    const input = RuleSchema.parse(request.body);
    const ocId = z.string().uuid().parse((request.body as { operating_company_id: string }).operating_company_id);
    // G2-2: uuid-valid is not membership — assert the caller belongs to this company before writing under it.
    await assertCompanyMembership(user.uuid, ocId);

    return withCurrentUser(user.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [ocId]);
      const sql = `
        INSERT INTO alerts.rule (
          operating_company_id, profile_id, trigger_event, audience, channel,
          ping_count, reping_cadence, cutoff_time, force_ack, force_alarm,
          auto_send, hold_for_review, escalate_to_user_id, escalate_after_missed, conditions, created_by_user_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *
      `;
      const result = await (client as Queryable).query(sql, [
        ocId, input.profile_id, input.trigger_event, input.audience, input.channel,
        input.ping_count, input.reping_cadence || null, input.cutoff_time || null,
        input.force_ack, input.force_alarm, input.auto_send, input.hold_for_review,
        input.escalate_to_user_id || null, input.escalate_after_missed,
        JSON.stringify(input.conditions), user.uuid,
      ]);
      reply.status(201);
      return { rule: result.rows[0] };
    });
  });

  // GET /alert/broker-queue — pending approval items
  fastify.get("/broker-queue", async (request, reply) => {
    const user = authUser(request, reply);
    if (!user) return;

    const { operating_company_id } = z.object({ operating_company_id: z.string().uuid() }).parse(request.query);
    // G2-2: uuid-valid is not membership — assert the caller belongs to this company before scoping RLS to it.
    await assertCompanyMembership(user.uuid, operating_company_id);

    return withCurrentUser(user.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operating_company_id]);
      const sql = `
        SELECT
          q.*,
          l.load_number,
          c.customer_name as broker_name
        FROM alerts.broker_queue q
        LEFT JOIN mdata.loads l ON l.id = q.load_id
                                AND l.operating_company_id = $1::uuid
        LEFT JOIN mdata.customers c ON c.id = q.broker_id
                                    AND c.operating_company_id = $1::uuid
        WHERE q.operating_company_id = $1::uuid AND q.status = 'pending' AND q.is_active = true
        ORDER BY q.created_at DESC
      `;
      const result = await (client as Queryable).query(sql, [operating_company_id]);
      return { queue: result.rows, count: result.rows.length };
    });
  });

  // POST /alert/broker-queue/:id/decide — approve/reject
  fastify.post("/broker-queue/:id/decide", async (request, reply) => {
    const user = authUser(request, reply);
    if (!user) return;

    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = QueueDecisionSchema.parse(request.body);
    // Use the uuid-validated value off the parsed schema (G2-1) — never a raw cast off request.body.
    const ocId = input.operating_company_id;
    // G2-2: uuid-valid is not membership — assert the caller belongs to this company before deciding under it.
    await assertCompanyMembership(user.uuid, ocId);

    return withCurrentUser(user.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [ocId]);
      
      const sql = `
        UPDATE alerts.broker_queue
        SET status = $1, decided_by_user_id = $2, decided_at = NOW(), edited_message = $3
        WHERE queue_id = $4 AND operating_company_id = $5::uuid
        RETURNING *
      `;
      const result = await (client as Queryable).query(sql, [
        input.status, user.uuid, input.edited_message || null, id, ocId,
      ]);
      
      if (result.rows.length === 0) { reply.status(404); return { error: "Queue item not found" }; }
      
      // Log to event spine — PARAMETERIZED bind (G2-1). All caller-supplied values ride as $n
      // placeholders; NEVER string-interpolated into the SQL text (SQL-injection sink).
      try {
        await (client as Queryable).query(
          `SELECT events.log_event($1, $2, 'user', $3, 'broker', $4, $5::jsonb, NOW(), 'alerts')`,
          [ocId, `broker.update_${input.status}`, user.uuid, id, JSON.stringify({ queue_id: id })]
        );
      } catch (e) { /* ignore */ }
      
      return { decision: result.rows[0] };
    });
  });
}
