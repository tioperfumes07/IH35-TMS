import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const createSelectionSchema = z.object({
  period: z.string().trim().min(1),
  annual_drug_rate: z.number().min(0).max(1),
  annual_alcohol_rate: z.number().min(0).max(1),
  seed: z.string().trim().min(1),
});

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

function seededPick(seed: string, index: number, poolSize: number) {
  let hash = 0;
  const raw = `${seed}:${index}:${poolSize}`;
  for (let i = 0; i < raw.length; i += 1) hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  return poolSize === 0 ? 0 : hash % poolSize;
}

async function withCompanyScope<T>(userId: string, companyId: string, fn: (client: Queryable) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${companyId}'`);
    return fn(client as Queryable);
  });
}

export async function registerSafetyDrugPoolRoutes(app: FastifyInstance) {
  app.post("/api/v1/safety/drug-pool/selections", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const body = createSelectionSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const created = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const rosterRes = await client.query<{ id: string }>(
        `
          SELECT id
          FROM mdata.drivers
          WHERE operating_company_id = $1
            AND cdl_number IS NOT NULL
            AND deactivated_at IS NULL
          ORDER BY id
        `,
        [query.data.operating_company_id]
      );
      const roster = rosterRes.rows;
      const targetCount = Math.max(0, Math.ceil(roster.length * body.data.annual_drug_rate));
      const selectedDriverIds: string[] = [];
      for (let i = 0; i < targetCount; i += 1) {
        const idx = seededPick(body.data.seed, i, roster.length);
        const driverId = roster[idx]?.id;
        if (driverId && !selectedDriverIds.includes(driverId)) selectedDriverIds.push(driverId);
      }

      const insertRes = await client.query(
        `
          INSERT INTO safety.drug_pool_selections (
            operating_company_id,
            period,
            annual_drug_rate,
            annual_alcohol_rate,
            seed,
            selected_driver_ids
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb)
          RETURNING *
        `,
        [
          query.data.operating_company_id,
          body.data.period,
          body.data.annual_drug_rate,
          body.data.annual_alcohol_rate,
          body.data.seed,
          JSON.stringify(selectedDriverIds),
        ]
      );

      await appendCrudAudit(
        client,
        user.uuid,
        "safety.drug_pool.selection_created",
        {
          operating_company_id: query.data.operating_company_id,
          resource_type: "safety.drug_pool_selections",
          resource_id: (insertRes.rows[0] as { id?: string })?.id ?? null,
          seed: body.data.seed,
        },
        "info",
        "P7-SAFETY-TRAINING-PROGRAMS"
      );
      return insertRes.rows[0];
    });
    return reply.code(201).send(created);
  });
}
