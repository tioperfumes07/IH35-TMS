import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../auth/session-middleware.js";
import { withCurrentUser } from "../../auth/db.js";
import {
  computeRelationshipScore,
  listAtRiskRelationshipScores,
  upsertRelationshipScore,
} from "./scorer.service.js";

const paramsSchema = z.object({
  uuid: z.string().uuid(),
});

const singleQuerySchema = z.object({
  operating_company_id: z.string().uuid().optional(),
});

const atRiskQuerySchema = z.object({
  operating_company_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(250).default(50),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

async function resolveOperatingCompanyId(
  client: { query: (sql: string, values: unknown[]) => Promise<{ rows: Array<{ id: string }> }> },
  userId: string,
  requested?: string
) {
  if (requested) return requested;
  const res = await client.query(
    `
      SELECT c.id
      FROM identity.users u
      JOIN org.companies c ON c.id = u.default_company_id
      WHERE u.id = $1
        AND c.deactivated_at IS NULL
      UNION
      SELECT c.id
      FROM org.companies c
      WHERE c.id IN (SELECT org.user_accessible_company_ids())
      ORDER BY id
      LIMIT 1
    `,
    [userId]
  );
  return res.rows[0]?.id ?? null;
}

async function relationshipScoresTableExists(client: {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<{ rel?: string | null }> }>;
}) {
  const res = await client.query(`SELECT to_regclass('master_data.customer_relationship_scores') AS rel`);
  return Boolean(res.rows[0]?.rel);
}

export async function registerCustomerRelationshipScoreRoutes(app: FastifyInstance) {
  app.get("/api/v1/customers/:uuid/relationship-score", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;

    const parsedParams = paramsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return reply.code(400).send({ error: "invalid_customer_id" });
    const parsedQuery = singleQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return reply.code(400).send({ error: "validation_error", details: parsedQuery.error.flatten() });

    const result = await withCurrentUser(authUser.uuid, async (client) => {
      const operatingCompanyId = await resolveOperatingCompanyId(
        client,
        authUser.uuid,
        parsedQuery.data.operating_company_id
      );
      if (!operatingCompanyId) return { error: "operating_company_id_required" as const };

      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
      const customerRes = await client.query<{ id: string }>(
        `
          SELECT id::text AS id
          FROM mdata.customers
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
          LIMIT 1
        `,
        [parsedParams.data.uuid, operatingCompanyId]
      );
      if (!customerRes.rows[0]) return { error: "customer_not_found" as const };
      if (!(await relationshipScoresTableExists(client))) {
        return { error: "relationship_scores_unavailable" as const };
      }

      const computed = await computeRelationshipScore(client, {
        operating_company_id: operatingCompanyId,
        customer_uuid: parsedParams.data.uuid,
      });
      const persisted = await upsertRelationshipScore(client, computed);
      return { score: persisted };
    });

    if ("error" in result) {
      if (result.error === "operating_company_id_required") {
        return reply.code(400).send({ error: result.error });
      }
      if (result.error === "customer_not_found") {
        return reply.code(404).send({ error: result.error });
      }
      return reply.code(503).send({ error: result.error });
    }

    return result.score;
  });

  app.get("/api/v1/customers/relationship-scores/at-risk", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;

    const parsedQuery = atRiskQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return reply.code(400).send({ error: "validation_error", details: parsedQuery.error.flatten() });

    const result = await withCurrentUser(authUser.uuid, async (client) => {
      const operatingCompanyId = await resolveOperatingCompanyId(
        client,
        authUser.uuid,
        parsedQuery.data.operating_company_id
      );
      if (!operatingCompanyId) return { error: "operating_company_id_required" as const };

      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
      const rows = await listAtRiskRelationshipScores(client, operatingCompanyId, parsedQuery.data.limit);
      return { operating_company_id: operatingCompanyId, count: rows.length, customers: rows };
    });

    if ("error" in result) {
      return reply.code(400).send({ error: result.error });
    }
    return result;
  });
}
