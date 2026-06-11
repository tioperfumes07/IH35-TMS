import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";

type Queryable = { query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }> };

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user!;
}

export async function registerDriverAlertRoutes(app: FastifyInstance) {
  // POST /api/v1/driver-alerts — office dispatches a blocking alert to a driver
  app.post("/api/v1/driver-alerts", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const input = z.object({
      operating_company_id: z.string().uuid(),
      driver_id: z.string().uuid(),
      load_id: z.string().uuid().optional(),
      alert_type: z.enum(["safety_doc_required", "load_assignment", "detention_approval", "custom"]),
      message: z.string().min(1).max(1000),
      severity: z.enum(["normal", "urgent", "alarm"]).default("normal"),
      requires_ack: z.boolean().default(true),
      ack_deadline_at: z.string().datetime().optional(),
    }).parse(req.body);

    return withCurrentUser(user.uuid, async (client) => {
      await (client as Queryable).query(`SET LOCAL app.current_operating_company_id = '${input.operating_company_id}'`);
      await (client as Queryable).query("BEGIN");

      const { rows } = await (client as Queryable).query<{ id: string }>(
        `INSERT INTO driveralert.dispatch
           (operating_company_id, driver_id, load_id, alert_type, message,
            severity, requires_ack, ack_deadline_at, created_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id`,
        [
          input.operating_company_id,
          input.driver_id,
          input.load_id ?? null,
          input.alert_type,
          input.message,
          input.severity,
          input.requires_ack,
          input.ack_deadline_at ?? null,
          user.uuid,
        ]
      );
      const dispatchId = rows[0].id;

      await (client as Queryable).query(
        `INSERT INTO driveralert.alarm_event
           (operating_company_id, dispatch_id, event_type, actor_type, actor_id, payload)
         VALUES ($1,$2,'sent','user',$3,$4)`,
        [
          input.operating_company_id,
          dispatchId,
          user.uuid,
          JSON.stringify({ alert_type: input.alert_type, message: input.message }),
        ]
      );

      await (client as Queryable).query("COMMIT");
      return reply.status(201).send({ id: dispatchId });
    });
  });

  // GET /api/v1/driver-alerts/pending/:driver_id — PWA polls for unacked alerts
  app.get("/api/v1/driver-alerts/pending/:driver_id", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const { driver_id } = req.params as { driver_id: string };
    const { operating_company_id } = z
      .object({ operating_company_id: z.string().uuid() })
      .parse(req.query);

    return withCurrentUser(user.uuid, async (client) => {
      await (client as Queryable).query(`SET LOCAL app.current_operating_company_id = '${operating_company_id}'`);
      const result = await (client as Queryable).query(
        `SELECT id, alert_type, message, severity, requires_ack, ack_deadline_at,
                re_alarm_count, created_at
         FROM driveralert.dispatch
         WHERE operating_company_id = $1
           AND driver_id = $2
           AND requires_ack = true
           AND acked_at IS NULL
           AND is_active = true
         ORDER BY created_at ASC`,
        [operating_company_id, driver_id]
      );
      return reply.send({ alerts: result.rows });
    });
  });

  // POST /api/v1/driver-alerts/:id/ack — driver acknowledges the alert
  app.post("/api/v1/driver-alerts/:id/ack", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const input = z.object({
      operating_company_id: z.string().uuid(),
      ack_method: z.enum(["driver_app", "office_override", "timeout"]).default("driver_app"),
    }).parse(req.body);

    return withCurrentUser(user.uuid, async (client) => {
      await (client as Queryable).query(`SET LOCAL app.current_operating_company_id = '${input.operating_company_id}'`);
      await (client as Queryable).query("BEGIN");

      const { rows } = await (client as Queryable).query<{ id: string }>(
        `UPDATE driveralert.dispatch
         SET acked_at = now(),
             acked_by_driver_id = $1,
             ack_method = $2,
             updated_at = now()
         WHERE id = $3
           AND operating_company_id = $4
           AND acked_at IS NULL
         RETURNING id`,
        [user.uuid, input.ack_method, id, input.operating_company_id]
      );

      if (rows.length === 0) {
        await (client as Queryable).query("ROLLBACK");
        return reply.status(404).send({ error: "Alert not found or already acknowledged" });
      }

      await (client as Queryable).query(
        `INSERT INTO driveralert.alarm_event
           (operating_company_id, dispatch_id, event_type, actor_type, actor_id, payload)
         VALUES ($1,$2,'acked','driver',$3,$4)`,
        [input.operating_company_id, id, user.uuid, JSON.stringify({ ack_method: input.ack_method })]
      );

      await (client as Queryable).query("COMMIT");
      return reply.send({ acknowledged: true });
    });
  });

  // POST /api/v1/driver-alerts/:id/re-alarm — system or office triggers re-alarm
  app.post("/api/v1/driver-alerts/:id/re-alarm", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const { operating_company_id } = z
      .object({ operating_company_id: z.string().uuid() })
      .parse(req.body);

    return withCurrentUser(user.uuid, async (client) => {
      await (client as Queryable).query(`SET LOCAL app.current_operating_company_id = '${operating_company_id}'`);
      await (client as Queryable).query("BEGIN");

      const { rows } = await (client as Queryable).query<{ id: string }>(
        `UPDATE driveralert.dispatch
         SET re_alarm_count = re_alarm_count + 1,
             last_re_alarmed_at = now(),
             updated_at = now()
         WHERE id = $1
           AND operating_company_id = $2
           AND acked_at IS NULL
           AND is_active = true
         RETURNING id`,
        [id, operating_company_id]
      );

      if (rows.length === 0) {
        await (client as Queryable).query("ROLLBACK");
        return reply.status(404).send({ error: "Alert not found, already acked, or inactive" });
      }

      await (client as Queryable).query(
        `INSERT INTO driveralert.alarm_event
           (operating_company_id, dispatch_id, event_type, actor_type, actor_id, payload)
         VALUES ($1,$2,'re_alarm','user',$3,$4)`,
        [operating_company_id, id, user.uuid, JSON.stringify({ triggered_by: user.uuid })]
      );

      await (client as Queryable).query("COMMIT");
      return reply.send({ re_alarmed: true });
    });
  });

  // GET /api/v1/driver-alerts/:id/evidence — office views ack evidence
  app.get("/api/v1/driver-alerts/:id/evidence", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const { operating_company_id } = z
      .object({ operating_company_id: z.string().uuid() })
      .parse(req.query);

    return withCurrentUser(user.uuid, async (client) => {
      await (client as Queryable).query(`SET LOCAL app.current_operating_company_id = '${operating_company_id}'`);
      const { rows: dispatchRows } = await (client as Queryable).query(
        `SELECT id, driver_id, load_id, alert_type, message, severity,
                requires_ack, acked_at, acked_by_driver_id, ack_method,
                re_alarm_count, created_at
         FROM driveralert.dispatch
         WHERE id = $1 AND operating_company_id = $2`,
        [id, operating_company_id]
      );

      if (dispatchRows.length === 0) {
        return reply.status(404).send({ error: "Alert not found" });
      }

      const { rows: eventRows } = await (client as Queryable).query(
        `SELECT id, event_type, actor_type, actor_id, occurred_at, payload, spine_event_id
         FROM driveralert.alarm_event
         WHERE dispatch_id = $1
         ORDER BY occurred_at ASC`,
        [id]
      );

      return reply.send({ dispatch: dispatchRows[0], events: eventRows });
    });
  });
}
