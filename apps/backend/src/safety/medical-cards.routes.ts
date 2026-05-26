import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const createMedicalCardSchema = z.object({
  driver_id: z.string().uuid(),
  card_number: z.string().trim().min(1),
  issued_date: z.string(),
  expiry_date: z.string(),
  notes: z.string().optional(),
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

export async function registerSafetyMedicalCardsRoutes(app: FastifyInstance) {
  app.post("/api/v1/safety/medical-cards", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const company = companyQuerySchema.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error", details: company.error.flatten() });
    const body = createMedicalCardSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const created = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          INSERT INTO safety.medical_cards (
            operating_company_id,
            driver_id,
            card_number,
            issued_date,
            expiry_date,
            notes
          )
          VALUES ($1, $2, $3, $4::date, $5::date, $6)
          RETURNING *
        `,
        [
          company.data.operating_company_id,
          body.data.driver_id,
          body.data.card_number,
          body.data.issued_date,
          body.data.expiry_date,
          body.data.notes ?? null,
        ]
      );

      await appendCrudAudit(
        client,
        user.uuid,
        "safety.medical_card.created",
        {
          resource_type: "safety.medical_cards",
          resource_id: (res.rows[0] as { id?: string })?.id ?? null,
          operating_company_id: company.data.operating_company_id,
          driver_id: body.data.driver_id,
        },
        "info",
        "P7-SAFETY-DRIVER-PROFILES"
      );
      return res.rows[0];
    });

    return reply.code(201).send(created);
  });
}
