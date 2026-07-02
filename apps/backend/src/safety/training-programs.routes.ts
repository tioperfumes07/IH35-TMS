import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const createProgramSchema = z.object({
  name: z.string().trim().min(1),
  category: z.enum(["entry_level", "refresher", "remedial", "hazmat", "other"]),
  frequency: z.enum(["one_time", "annual", "n_month"]),
  passing_grade: z.string().trim().optional(),
});

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

async function withCompanyScope<T>(userId: string, companyId: string, fn: (client: Queryable) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    return fn(client as Queryable);
  });
}

export async function registerSafetyTrainingProgramsRoutes(app: FastifyInstance) {
  app.post("/api/v1/safety/training-programs", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const body = createProgramSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const created = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          INSERT INTO safety.training_programs (
            operating_company_id,
            name,
            category,
            frequency,
            passing_grade
          )
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `,
        [
          query.data.operating_company_id,
          body.data.name,
          body.data.category,
          body.data.frequency,
          body.data.passing_grade ?? null,
        ]
      );
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.training_program.created",
        {
          operating_company_id: query.data.operating_company_id,
          resource_type: "safety.training_programs",
          resource_id: (res.rows[0] as { id?: string })?.id ?? null,
        },
        "info",
        "P7-SAFETY-TRAINING-PROGRAMS"
      );
      return res.rows[0];
    });
    return reply.code(201).send(created);
  });
}
