import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";

type Queryable = { query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }> };

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user!;
}

export async function registerBrokerUpdateRoutes(app: FastifyInstance) {
  // POST /api/v1/broker-profiles — create/configure a broker profile
  app.post("/api/v1/broker-profiles", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const input = z.object({
      operating_company_id: z.string().uuid(),
      broker_name: z.string().min(1).max(200),
      email: z.string().email(),
      auto_send_enabled: z.boolean().default(false),
      auto_send_classes: z.array(z.enum([
        "pickup_confirmed", "in_transit", "delay_notification",
        "delivery_confirmed", "detention_alert", "custom"
      ])).default([]),
    }).parse(req.body);

    return withCurrentUser(user.uuid, async (client) => {
      await (client as Queryable).query("SELECT set_config('app.operating_company_id', $1, true)", [input.operating_company_id]);
      const { rows } = await (client as Queryable).query<{ id: string }>(
        `INSERT INTO brokerupdate.profile
           (operating_company_id, broker_name, email, auto_send_enabled, auto_send_classes, created_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (operating_company_id, email) DO UPDATE
           SET broker_name = EXCLUDED.broker_name,
               auto_send_enabled = EXCLUDED.auto_send_enabled,
               auto_send_classes = EXCLUDED.auto_send_classes,
               updated_at = now()
         RETURNING id`,
        [input.operating_company_id, input.broker_name, input.email,
         input.auto_send_enabled, input.auto_send_classes, user.uuid]
      );
      return reply.status(201).send({ id: rows[0].id });
    });
  });

  // GET /api/v1/broker-profiles — list profiles for a company
  app.get("/api/v1/broker-profiles", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const { operating_company_id } = z
      .object({ operating_company_id: z.string().uuid() })
      .parse(req.query);

    return withCurrentUser(user.uuid, async (client) => {
      await (client as Queryable).query("SELECT set_config('app.operating_company_id', $1, true)", [operating_company_id]);
      const result = await (client as Queryable).query(
        `SELECT id, broker_name, email, auto_send_enabled, auto_send_classes, is_active, created_at
         FROM brokerupdate.profile
         WHERE operating_company_id = $1 AND is_active = true
         ORDER BY broker_name`,
        [operating_company_id]
      );
      return reply.send({ profiles: result.rows });
    });
  });

  // POST /api/v1/broker-updates — queue an update (goes to pending_review by default)
  app.post("/api/v1/broker-updates", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const input = z.object({
      operating_company_id: z.string().uuid(),
      profile_id: z.string().uuid(),
      load_id: z.string().uuid(),
      event_class: z.enum([
        "pickup_confirmed", "in_transit", "delay_notification",
        "delivery_confirmed", "detention_alert", "custom"
      ]),
      subject: z.string().min(1).max(300),
      body_text: z.string().min(1),
    }).parse(req.body);

    return withCurrentUser(user.uuid, async (client) => {
      await (client as Queryable).query("SELECT set_config('app.operating_company_id', $1, true)", [input.operating_company_id]);

      // Check if auto-send is enabled for this event class on this profile
      const { rows: profileRows } = await (client as Queryable).query<{
        auto_send_enabled: boolean;
        auto_send_classes: string[];
      }>(
        `SELECT auto_send_enabled, auto_send_classes
         FROM brokerupdate.profile
         WHERE id = $1 AND operating_company_id = $2 AND is_active = true`,
        [input.profile_id, input.operating_company_id]
      );

      if (profileRows.length === 0) {
        return reply.status(404).send({ error: "Broker profile not found" });
      }

      const profile = profileRows[0];
      const autoSend = profile.auto_send_enabled &&
        (profile.auto_send_classes as string[]).includes(input.event_class);
      const status = autoSend ? "auto_sent" : "pending_review";

      const { rows } = await (client as Queryable).query<{ id: string }>(
        `INSERT INTO brokerupdate.send
           (operating_company_id, profile_id, load_id, event_class, subject, body_text,
            status, auto_sent, created_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id`,
        [input.operating_company_id, input.profile_id, input.load_id,
         input.event_class, input.subject, input.body_text,
         status, autoSend, user.uuid]
      );

      return reply.status(201).send({ id: rows[0].id, status });
    });
  });

  // GET /api/v1/broker-updates/queue — pending-review queue for office approval
  app.get("/api/v1/broker-updates/queue", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const { operating_company_id } = z
      .object({ operating_company_id: z.string().uuid() })
      .parse(req.query);

    return withCurrentUser(user.uuid, async (client) => {
      await (client as Queryable).query("SELECT set_config('app.operating_company_id', $1, true)", [operating_company_id]);
      const result = await (client as Queryable).query(
        `SELECT s.id, s.load_id, s.event_class, s.subject, s.body_text,
                s.status, s.auto_sent, s.created_at,
                p.broker_name, p.email
         FROM brokerupdate.send s
         JOIN brokerupdate.profile p ON p.id = s.profile_id
         WHERE s.operating_company_id = $1
           AND s.status = 'pending_review'
           AND s.is_active = true
         ORDER BY s.created_at ASC`,
        [operating_company_id]
      );
      return reply.send({ queue: result.rows });
    });
  });

  // POST /api/v1/broker-updates/:id/approve — office approves send
  app.post("/api/v1/broker-updates/:id/approve", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const { operating_company_id } = z
      .object({ operating_company_id: z.string().uuid() })
      .parse(req.body);

    return withCurrentUser(user.uuid, async (client) => {
      await (client as Queryable).query("SELECT set_config('app.operating_company_id', $1, true)", [operating_company_id]);
      const { rows } = await (client as Queryable).query<{ id: string }>(
        `UPDATE brokerupdate.send
         SET status = 'approved', reviewed_by_user_id = $1, reviewed_at = now()
         WHERE id = $2 AND operating_company_id = $3 AND status = 'pending_review'
         RETURNING id`,
        [user.uuid, id, operating_company_id]
      );
      if (rows.length === 0) return reply.status(404).send({ error: "Send not found or not pending review" });
      return reply.send({ approved: true });
    });
  });

  // POST /api/v1/broker-updates/:id/reject — office rejects send
  app.post("/api/v1/broker-updates/:id/reject", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const { operating_company_id } = z
      .object({ operating_company_id: z.string().uuid() })
      .parse(req.body);

    return withCurrentUser(user.uuid, async (client) => {
      await (client as Queryable).query("SELECT set_config('app.operating_company_id', $1, true)", [operating_company_id]);
      const { rows } = await (client as Queryable).query<{ id: string }>(
        `UPDATE brokerupdate.send
         SET status = 'rejected', reviewed_by_user_id = $1, reviewed_at = now()
         WHERE id = $2 AND operating_company_id = $3 AND status = 'pending_review'
         RETURNING id`,
        [user.uuid, id, operating_company_id]
      );
      if (rows.length === 0) return reply.status(404).send({ error: "Send not found or not pending review" });
      return reply.send({ rejected: true });
    });
  });
}
