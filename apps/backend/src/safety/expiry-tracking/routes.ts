import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { scanAllDrivers, scanDriverCerts, type CertType } from "./cert-monitor.service.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  severity: z.enum(["critical", "warn", "info"]).optional(),
  cert_type: z
    .enum(["cdl", "medical_card", "hazmat_endorsement", "twic", "passport", "drug_test"])
    .optional(),
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
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    return fn(client as Queryable);
  });
}

export async function registerCertExpiryTrackingRoutes(app: FastifyInstance) {
  app.get("/api/safety/cert-expiry/all", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    const alerts = await withCompanyScope(user.uuid, parsed.data.operating_company_id, (client) =>
      scanAllDrivers(client, parsed.data.operating_company_id)
    );
    const filtered = alerts.filter((alert) => {
      if (parsed.data.severity && alert.severity !== parsed.data.severity) return false;
      if (parsed.data.cert_type && alert.cert_type !== parsed.data.cert_type) return false;
      return true;
    });

    return reply.send({
      alerts: filtered,
      count: filtered.length,
      applied_filters: {
        severity: parsed.data.severity ?? null,
        cert_type: (parsed.data.cert_type as CertType | undefined) ?? null,
      },
    });
  });

  app.get("/api/safety/cert-expiry/driver/:uuid", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
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

    const alerts = await withCompanyScope(user.uuid, parsedQuery.data.operating_company_id, (client) =>
      scanDriverCerts(client, parsedQuery.data.operating_company_id, parsedParams.data.uuid)
    );

    return reply.send({
      driver_uuid: parsedParams.data.uuid,
      alerts,
      count: alerts.length,
    });
  });
}
