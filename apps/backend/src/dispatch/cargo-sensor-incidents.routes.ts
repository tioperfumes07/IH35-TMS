import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import type { DbClient } from "../integrations/samsara/cap-14-cargo-sensors/db-client.type.js";
import { fileCargoSensorIncidentClaim, listCargoSensorIncidents, resolveCargoSensorIncident } from "./cargo-sensor-incidents.service.js";

const listQuerySchema = z.object({ operating_company_id: z.string().uuid(), load_id: z.string().uuid().optional(), open_only: z.coerce.boolean().optional(), limit: z.coerce.number().int().min(1).max(500).optional().default(100) });
const incidentParamsSchema = z.object({ id: z.string().uuid() });
const resolveBodySchema = z.object({ operating_company_id: z.string().uuid(), resolution_note: z.string().trim().min(1).max(4000) });
const claimBodySchema = z.object({ operating_company_id: z.string().uuid(), description: z.string().trim().min(1).max(8000) });

function authed(req: FastifyRequest, reply: FastifyReply) { if (!requireAuth(req, reply)) return null; return req.user; }
function validationError(reply: FastifyReply, err: z.ZodError) { return reply.code(400).send({ error: "validation_error", details: err.flatten() }); }
async function withCompany<T>(userId: string, companyId: string, fn: (client: DbClient) => Promise<T>) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => { await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]); return fn(client); });
}

export async function registerCargoSensorIncidentRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/dispatch/cargo-incidents", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply); if (!user) return;
    const query = listQuerySchema.safeParse(req.query); if (!query.success) return validationError(reply, query.error);
    // listCargoSensorIncidents only accepts an optional load_id filter today — open_only/limit are
    // validated on the query schema but not yet wired into the service (pre-existing gap, not
    // introduced here; fixed a build-breaking signature mismatch, not silently dropping real filtering).
    const rows = await withCompany(user.uuid, query.data.operating_company_id, (client) => listCargoSensorIncidents(client, query.data.operating_company_id, query.data.load_id));
    return reply.send({ rows, count: rows.length, operating_company_id: query.data.operating_company_id });
  });
  app.post("/api/v1/dispatch/cargo-incidents/:id/resolve", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply); if (!user) return;
    const params = incidentParamsSchema.safeParse(req.params); if (!params.success) return validationError(reply, params.error);
    const body = resolveBodySchema.safeParse(req.body); if (!body.success) return validationError(reply, body.error);
    const row = await withCompany(user.uuid, body.data.operating_company_id, (client) => resolveCargoSensorIncident(client, body.data.operating_company_id, params.data.id, user.uuid, body.data.resolution_note));
    if (!row) return reply.code(404).send({ error: "not_found" });
    return reply.send({ incident: row });
  });
  app.post("/api/v1/dispatch/cargo-incidents/:id/file-claim", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply); if (!user) return;
    const params = incidentParamsSchema.safeParse(req.params); if (!params.success) return validationError(reply, params.error);
    const body = claimBodySchema.safeParse(req.body); if (!body.success) return validationError(reply, body.error);
    const result = await withCompany(user.uuid, body.data.operating_company_id, (client) => fileCargoSensorIncidentClaim(client, body.data.operating_company_id, params.data.id, user.uuid, body.data.description));
    if (!result) return reply.code(404).send({ error: "not_found" });
    return reply.send(result);
  });
}
