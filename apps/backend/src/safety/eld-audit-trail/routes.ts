import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import {
  assertReadOnlySurface,
  buildDotAuditPdfPayload,
  getEditHistory,
  getRecentEditHistory,
} from "./viewer.service.js";
import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const auditTrailQuerySchema = companyQuerySchema.extend({
  driver: z.string().uuid(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const driverParamsSchema = z.object({
  uuid: z.string().uuid(),
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
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    return fn(client as Queryable);
  });
}

export async function registerEldAuditTrailRoutes(app: FastifyInstance) {
  app.get("/api/safety/eld/audit-trail", async (req, reply) => {
    assertReadOnlySurface(req.method);
    const user = authUser(req, reply);
    if (!user) return;
    const parsed = auditTrailQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    const history = await withCompanyScope(user.uuid, parsed.data.operating_company_id, (client) =>
      getEditHistory(client, parsed.data.operating_company_id, parsed.data.driver, parsed.data.from, parsed.data.to)
    );

    return reply.send({
      ...history,
      pdf_payload: buildDotAuditPdfPayload(history),
    });
  });

  app.get("/api/safety/eld/audit-trail/driver/:uuid/recent", async (req, reply) => {
    assertReadOnlySurface(req.method);
    const user = authUser(req, reply);
    if (!user) return;
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
    const parsedParams = driverParamsSchema.safeParse(req.params ?? {});
    if (!parsedQuery.success) {
      return reply.code(400).send({ error: "validation_error", details: parsedQuery.error.flatten() });
    }
    if (!parsedParams.success) {
      return reply.code(400).send({ error: "validation_error", details: parsedParams.error.flatten() });
    }

    const history = await withCompanyScope(user.uuid, parsedQuery.data.operating_company_id, (client) =>
      getRecentEditHistory(client, parsedQuery.data.operating_company_id, parsedParams.data.uuid)
    );

    return reply.send(history);
  });
}
