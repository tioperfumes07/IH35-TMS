import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { listDriverTrend, listPeriodLeaderboard, type ScoringDbClient } from "./scoring.service.js";
import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const periodQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  from: z.string().regex(ISO_DATE),
  to: z.string().regex(ISO_DATE),
});

const driverTrendQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  periods: z.coerce.number().int().min(1).max(52).default(12),
});

const driverParamsSchema = z.object({
  uuid: z.string().uuid(),
});

type Queryable = ScoringDbClient;

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: Queryable) => Promise<T>
) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    return fn(client);
  });
}

export async function registerDriverCompositeScoringRoutes(app: FastifyInstance) {
  app.get("/api/safety/driver-scoring/period", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const parsed = periodQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }

    const rows = await withCompanyScope(user.uuid, parsed.data.operating_company_id, (client) =>
      listPeriodLeaderboard(client, parsed.data.operating_company_id, parsed.data.from, parsed.data.to)
    );

    return reply.send({
      period_start: parsed.data.from,
      period_end: parsed.data.to,
      rows,
    });
  });

  app.get("/api/safety/driver-scoring/driver/:uuid", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const parsedQuery = driverTrendQuerySchema.safeParse(req.query ?? {});
    const parsedParams = driverParamsSchema.safeParse(req.params ?? {});
    if (!parsedQuery.success || !parsedParams.success) {
      return reply.code(400).send({
        error: "validation_error",
        details: {
          query: parsedQuery.success ? undefined : parsedQuery.error.flatten(),
          params: parsedParams.success ? undefined : parsedParams.error.flatten(),
        },
      });
    }

    const periods = await withCompanyScope(user.uuid, parsedQuery.data.operating_company_id, (client) =>
      listDriverTrend(
        client,
        parsedQuery.data.operating_company_id,
        parsedParams.data.uuid,
        parsedQuery.data.periods
      )
    );

    return reply.send({
      driver_uuid: parsedParams.data.uuid,
      periods,
    });
  });
}
