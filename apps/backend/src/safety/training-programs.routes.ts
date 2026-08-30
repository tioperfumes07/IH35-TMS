import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const createProgramSchema = z
  .object({
    name: z.string().trim().min(1),
    category: z.enum(["entry_level", "refresher", "remedial", "hazmat", "other"]),
    frequency: z.enum(["one_time", "annual", "n_month"]),
    recertify_months: z.number().int().min(1).max(60).nullable().optional(),
    passing_grade: z.string().trim().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.frequency === "n_month" && value.recertify_months == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recertify_months"],
        message: "recertify_months is required for n_month programs",
      });
    }
    if (value.frequency !== "n_month" && value.recertify_months != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recertify_months"],
        message: "recertify_months is only valid for n_month programs",
      });
    }
  });

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

async function withCompanyScope<T>(userId: string, companyId: string, fn: (client: Queryable) => Promise<T>) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    return fn(client as Queryable);
  });
}

export async function registerSafetyTrainingProgramsRoutes(app: FastifyInstance) {
  app.get("/api/v1/safety/training-programs", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

    const trainingPrograms = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT id, operating_company_id, name, category, frequency,
                 recertify_months, passing_grade, created_at, updated_at
          FROM safety.training_programs
          WHERE operating_company_id = $1::uuid
            AND voided_at IS NULL
          ORDER BY lower(name), created_at, id
        `,
        [query.data.operating_company_id]
      );
      return res.rows;
    });
    return reply.send({ training_programs: trainingPrograms });
  });

  app.post("/api/v1/safety/training-programs", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const body = createProgramSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const created = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query<Record<string, unknown>>(
        `
          INSERT INTO safety.training_programs (
            operating_company_id,
            name,
            category,
            frequency,
            recertify_months,
            passing_grade
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `,
        [
          query.data.operating_company_id,
          body.data.name,
          body.data.category,
          body.data.frequency,
          body.data.frequency === "n_month" ? body.data.recertify_months : null,
          body.data.passing_grade ?? null,
        ]
      );
      const trainingProgram = res.rows[0];
      if (!trainingProgram?.id) throw new Error("safety_training_program_insert_failed");
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.training_program.created",
        {
          operating_company_id: query.data.operating_company_id,
          resource_type: "safety.training_programs",
          resource_id: trainingProgram.id,
        },
        "info",
        "P7-SAFETY-TRAINING-PROGRAMS"
      );
      return trainingProgram;
    });
    return reply.code(201).send(created);
  });
}
