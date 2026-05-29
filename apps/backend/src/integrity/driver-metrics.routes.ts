import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import {
  DRIVER_METRIC_NAMES,
  buildDriverMetricsLeaderboard,
  getDriverMetricsForTenant,
  resolvePeriodBounds,
  type DriverMetricName,
} from "./driver-metrics.service.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const driverMetricsQuerySchema = companyQuerySchema.extend({
  driver_id: z.string().uuid(),
  period: z.enum(["monthly", "quarterly", "ytd"]).default("monthly"),
  asof: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .default(() => new Date().toISOString().slice(0, 10)),
  flag_ratio: z.coerce.number().positive().max(10).optional(),
});

const leaderboardQuerySchema = companyQuerySchema.extend({
  metric: z.enum(DRIVER_METRIC_NAMES),
  period: z.enum(["monthly", "quarterly", "ytd"]).default("monthly"),
  asof: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .default(() => new Date().toISOString().slice(0, 10)),
  direction: z.enum(["high", "low"]).default("high"),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  flag_ratio: z.coerce.number().positive().max(10).optional(),
});

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  const role = String(req.user?.role ?? "");
  if (!["Owner", "Administrator", "Manager", "Accountant"].includes(role)) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return req.user!;
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

export async function registerDriverMetricsRoutes(app: FastifyInstance) {
  app.get("/api/v1/integrity/driver-metrics", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const parsed = driverMetricsQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    let bounds;
    try {
      bounds = resolvePeriodBounds(parsed.data.period, parsed.data.asof);
    } catch {
      return reply.code(400).send({ error: "invalid_asof" });
    }

    const flagRatio = parsed.data.flag_ratio ?? 1.5;
    const payload = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) =>
      getDriverMetricsForTenant(client, parsed.data.operating_company_id, bounds, parsed.data.driver_id, flagRatio)
    );

    if (!payload.driver) {
      return reply.code(404).send({ error: "driver_not_found" });
    }

    return {
      period: payload.bounds,
      driver: payload.driver,
      flag_ratio: parsed.data.flag_ratio ?? 1.5,
    };
  });

  app.get("/api/v1/integrity/driver-metrics/leaderboard", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const parsed = leaderboardQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    let bounds;
    try {
      bounds = resolvePeriodBounds(parsed.data.period, parsed.data.asof);
    } catch {
      return reply.code(400).send({ error: "invalid_asof" });
    }

    const flagRatio = parsed.data.flag_ratio ?? 1.5;
    const payload = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) =>
      getDriverMetricsForTenant(client, parsed.data.operating_company_id, bounds, undefined, flagRatio)
    );

    const leaderboard = buildDriverMetricsLeaderboard(
      payload.drivers,
      parsed.data.metric as DriverMetricName,
      parsed.data.direction,
      parsed.data.limit
    );

    return {
      period: payload.bounds,
      metric: parsed.data.metric,
      direction: parsed.data.direction,
      rows: leaderboard,
    };
  });
}
