import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const createCitationSchema = z.object({
  issued_at: z.string(),
  driver_id: z.string().uuid(),
  unit_id: z.string().uuid().optional(),
  citation_number: z.string().trim().min(1),
  citation_type: z.string().trim().min(1),
  disposition: z.enum(["pending", "paid", "dismissed", "cdl_affecting"]).default("pending"),
});

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: Queryable) => Promise<T>
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${operatingCompanyId}'`);
    return fn(client as Queryable);
  });
}

export async function registerSafetyCitationsRoutes(app: FastifyInstance) {
  app.post("/api/v1/safety/events/citations", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const company = companyQuerySchema.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error", details: company.error.flatten() });
    const body = createCitationSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const created = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          INSERT INTO safety.citations (
            operating_company_id,
            issued_at,
            driver_id,
            unit_id,
            citation_number,
            citation_type,
            disposition
          )
          VALUES ($1, $2::timestamptz, $3, $4, $5, $6, $7)
          RETURNING *
        `,
        [
          company.data.operating_company_id,
          body.data.issued_at,
          body.data.driver_id,
          body.data.unit_id ?? null,
          body.data.citation_number,
          body.data.citation_type,
          body.data.disposition,
        ]
      );
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.events.citation_created",
        {
          operating_company_id: company.data.operating_company_id,
          resource_type: "safety.citations",
          resource_id: (res.rows[0] as { id?: string })?.id ?? null,
          before: null,
          after: res.rows[0] ?? null,
        },
        "warning",
        "P7-SAFETY-EVENTS"
      );
      return res.rows[0];
    });
    return reply.code(201).send(created);
  });
}
