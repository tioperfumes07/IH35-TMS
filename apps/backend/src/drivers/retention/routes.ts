import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { computeRetentionScore, listRetentionScores, type RetentionTier } from "./scorer.service.js";

const companyQuery = z.object({
  operating_company_id: z.string().uuid(),
  tier: z.enum(["stable", "watch", "at_risk", "critical"]).optional(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerDriverRetentionRoutes(app: FastifyInstance) {
  app.get("/api/v1/drivers/retention-scores", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = companyQuery.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error" });

    return withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const rows = await listRetentionScores(client, query.data.operating_company_id, query.data.tier as RetentionTier | undefined);
      return reply.send({ rows, count: rows.length });
    });
  });

  app.get("/api/v1/drivers/:uuid/retention-score", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = z.object({ uuid: z.string().uuid() }).safeParse(req.params ?? {});
    const query = companyQuery.safeParse(req.query ?? {});
    if (!params.success || !query.success) return reply.code(400).send({ error: "validation_error" });

    return withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const score = await computeRetentionScore(client, query.data.operating_company_id, params.data.uuid);
      return reply.send(score);
    });
  });

  app.get("/api/v1/drivers/retention-scores/trend", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = companyQuery.extend({ period_weeks: z.coerce.number().int().min(1).max(52).default(12) }).safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error" });

    return withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const res = await client.query(
        `
          SELECT date_trunc('week', computed_at)::date::text AS week,
                 AVG(retention_risk_score)::float8 AS avg_risk
          FROM drivers.retention_scores
          WHERE operating_company_id = $1::uuid
            AND computed_at >= now() - ($2::text || ' weeks')::interval
          GROUP BY 1 ORDER BY 1
        `,
        [query.data.operating_company_id, String(query.data.period_weeks)]
      );
      return reply.send({ weeks: res.rows });
    });
  });
}
