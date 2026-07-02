import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";

type Queryable = { query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }> };

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user!;
}

const periodQuery = z.object({
  operating_company_id: z.string().uuid(),
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function registerUtilizationRoutes(app: FastifyInstance) {
  // GET /api/v1/utilization/by-driver — Finance > Time Utilization, By Driver
  app.get("/api/v1/utilization/by-driver", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const input = periodQuery.parse(req.query);

    return withCurrentUser(user.uuid, async (client) => {
      await (client as Queryable).query("SELECT set_config('app.operating_company_id', $1, true)", [input.operating_company_id]);
      const result = await (client as Queryable).query(
        `SELECT id, driver_id, period_start, period_end,
                minutes_driving, minutes_on_duty, minutes_loading, minutes_detention,
                minutes_idle, minutes_rest, minutes_deadhead, minutes_layover,
                minutes_oos, minutes_unaccounted, minutes_total,
                total_revenue_cents, total_cost_cents,
                cents_per_productive_hr, cents_per_driving_hr, utilization_pct,
                created_at
         FROM utilization.driver_period
         WHERE operating_company_id = $1
           AND period_start >= $2
           AND period_end <= $3
           AND is_active = true
         ORDER BY period_start DESC, driver_id
         LIMIT $4 OFFSET $5`,
        [input.operating_company_id, input.period_start, input.period_end, input.limit, input.offset]
      );
      return reply.send({ rows: result.rows, limit: input.limit, offset: input.offset });
    });
  });

  // GET /api/v1/utilization/by-truck — Finance > Time Utilization, By Truck
  app.get("/api/v1/utilization/by-truck", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const input = periodQuery.parse(req.query);

    return withCurrentUser(user.uuid, async (client) => {
      await (client as Queryable).query("SELECT set_config('app.operating_company_id', $1, true)", [input.operating_company_id]);
      const result = await (client as Queryable).query(
        `SELECT id, unit_id, period_start, period_end,
                minutes_in_use, minutes_idle, minutes_oos, minutes_unaccounted, minutes_total,
                total_revenue_cents, cents_per_productive_hr, utilization_pct,
                created_at
         FROM utilization.unit_period
         WHERE operating_company_id = $1
           AND period_start >= $2
           AND period_end <= $3
           AND is_active = true
         ORDER BY period_start DESC, unit_id
         LIMIT $4 OFFSET $5`,
        [input.operating_company_id, input.period_start, input.period_end, input.limit, input.offset]
      );
      return reply.send({ rows: result.rows, limit: input.limit, offset: input.offset });
    });
  });

  // GET /api/v1/utilization/driver/:driver_id — Finance > Time Utilization, Detail
  app.get("/api/v1/utilization/driver/:driver_id", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const { driver_id } = req.params as { driver_id: string };
    const input = periodQuery.parse(req.query);

    return withCurrentUser(user.uuid, async (client) => {
      await (client as Queryable).query("SELECT set_config('app.operating_company_id', $1, true)", [input.operating_company_id]);
      const result = await (client as Queryable).query(
        `SELECT id, driver_id, period_start, period_end,
                minutes_driving, minutes_on_duty, minutes_loading, minutes_detention,
                minutes_idle, minutes_rest, minutes_deadhead, minutes_layover,
                minutes_oos, minutes_unaccounted, minutes_total,
                total_revenue_cents, total_cost_cents,
                cents_per_productive_hr, cents_per_driving_hr, utilization_pct,
                spine_event_id, created_at
         FROM utilization.driver_period
         WHERE operating_company_id = $1
           AND driver_id = $2
           AND period_start >= $3
           AND period_end <= $4
           AND is_active = true
         ORDER BY period_start DESC
         LIMIT $5 OFFSET $6`,
        [input.operating_company_id, driver_id, input.period_start, input.period_end, input.limit, input.offset]
      );
      return reply.send({ rows: result.rows, driver_id, limit: input.limit, offset: input.offset });
    });
  });

  // GET /api/v1/utilization/unit/:unit_id — Detail for a specific truck
  app.get("/api/v1/utilization/unit/:unit_id", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const { unit_id } = req.params as { unit_id: string };
    const input = periodQuery.parse(req.query);

    return withCurrentUser(user.uuid, async (client) => {
      await (client as Queryable).query("SELECT set_config('app.operating_company_id', $1, true)", [input.operating_company_id]);
      const result = await (client as Queryable).query(
        `SELECT id, unit_id, period_start, period_end,
                minutes_in_use, minutes_idle, minutes_oos, minutes_unaccounted, minutes_total,
                total_revenue_cents, cents_per_productive_hr, utilization_pct,
                spine_event_id, created_at
         FROM utilization.unit_period
         WHERE operating_company_id = $1
           AND unit_id = $2
           AND period_start >= $3
           AND period_end <= $4
           AND is_active = true
         ORDER BY period_start DESC
         LIMIT $5 OFFSET $6`,
        [input.operating_company_id, unit_id, input.period_start, input.period_end, input.limit, input.offset]
      );
      return reply.send({ rows: result.rows, unit_id, limit: input.limit, offset: input.offset });
    });
  });
}
