import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const createEventDocumentSchema = z.object({
  event_type: z.enum(["accident", "citation", "roadside", "fmcsa"]),
  event_id: z.string().uuid(),
  document_type: z.string().trim().min(1),
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

export async function registerSafetyEventDocumentsRoutes(app: FastifyInstance) {
  app.post("/api/v1/safety/events/documents", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const company = companyQuerySchema.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error", details: company.error.flatten() });
    const body = createEventDocumentSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const created = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          INSERT INTO safety.event_documents (
            operating_company_id,
            event_type,
            event_id,
            document_type
          )
          VALUES ($1, $2, $3, $4)
          RETURNING *
        `,
        [company.data.operating_company_id, body.data.event_type, body.data.event_id, body.data.document_type]
      );
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.events.document_uploaded",
        {
          operating_company_id: company.data.operating_company_id,
          resource_type: "safety.event_documents",
          resource_id: (res.rows[0] as { id?: string })?.id ?? null,
          before: null,
          after: res.rows[0] ?? null,
        },
        "info",
        "P7-SAFETY-EVENTS"
      );
      return res.rows[0];
    });
    return reply.code(201).send(created);
  });
}
