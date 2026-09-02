/**
 * CAP-14 Cargo Sensor Routes — GAP-64
 * Base path: /api/v1/dispatch/cargo-sensors
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../../auth/db.js";
import { requireAuth } from "../../../auth/session-middleware.js";
import { listCargoSensorTimelineForLoad, listOutOfRangeCargoReadings, type DbClient } from "./ingester.service.js";
import { assertCompanyMembership } from "../../../_helpers/company-membership-guard.js";
import { fileCargoIncidentClaim, listCargoIncidents, resolveCargoIncident } from "./incident.service.js";

const timelineParamsSchema = z.object({
  load_uuid: z.string().uuid(),
});

const timelineQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(1000).optional().default(200),
});

const outOfRangeQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional().default(200),
});

const incidentQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  load_id: z.string().uuid().optional(),
});

const incidentParamsSchema = z.object({ id: z.string().uuid() });
const resolveIncidentBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  resolution_note: z.string().trim().min(3).max(2000),
});
const fileClaimBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  claim_reason_id: z.string().uuid(),
});

function mutationAllowed(role: string) {
  return ["Owner", "Administrator", "Safety", "Accountant"].includes(role);
}

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: DbClient) => Promise<T>) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
    return fn(client);
  });
}

export async function registerCap14CargoSensorRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/dispatch/cargo-incidents", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = incidentQuerySchema.safeParse(req.query);
    if (!query.success) return validationError(reply, query.error);
    const rows = await withCompany(user.uuid, query.data.operating_company_id, (client) =>
      listCargoIncidents(client, query.data.operating_company_id, query.data.load_id)
    );
    return reply.send({ rows, count: rows.length, operating_company_id: query.data.operating_company_id });
  });

  app.post("/api/v1/dispatch/cargo-incidents/:id/resolve", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!mutationAllowed(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = incidentParamsSchema.safeParse(req.params);
    if (!params.success) return validationError(reply, params.error);
    const body = resolveIncidentBodySchema.safeParse(req.body);
    if (!body.success) return validationError(reply, body.error);
    const row = await withCompany(user.uuid, body.data.operating_company_id, (client) =>
      resolveCargoIncident(client, body.data.operating_company_id, params.data.id, user.uuid, body.data.resolution_note)
    );
    if (!row) return reply.code(404).send({ error: "cargo_incident_not_found_or_already_resolved" });
    return reply.send({ incident: row });
  });

  app.post("/api/v1/dispatch/cargo-incidents/:id/file-claim", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!mutationAllowed(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = incidentParamsSchema.safeParse(req.params);
    if (!params.success) return validationError(reply, params.error);
    const body = fileClaimBodySchema.safeParse(req.body);
    if (!body.success) return validationError(reply, body.error);
    const row = await withCompany(user.uuid, body.data.operating_company_id, (client) =>
      fileCargoIncidentClaim(client, body.data.operating_company_id, params.data.id, user.uuid, body.data.claim_reason_id)
    );
    if (!row) return reply.code(409).send({ error: "cargo_incident_not_claimable_or_reason_invalid" });
    return reply.code(201).send(row);
  });

  app.get("/api/v1/dispatch/cargo-sensors/load/:load_uuid/timeline", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = timelineParamsSchema.safeParse(req.params);
    if (!params.success) return validationError(reply, params.error);
    const query = timelineQuerySchema.safeParse(req.query);
    if (!query.success) return validationError(reply, query.error);

    const payload = await withCompany(user.uuid, query.data.operating_company_id, async (client) =>
      listCargoSensorTimelineForLoad(
        client,
        query.data.operating_company_id,
        params.data.load_uuid,
        query.data.limit
      )
    );

    return reply.send(payload);
  });

  app.get("/api/v1/dispatch/cargo-sensors/out-of-range", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = outOfRangeQuerySchema.safeParse(req.query);
    if (!query.success) return validationError(reply, query.error);

    const rows = await withCompany(user.uuid, query.data.operating_company_id, async (client) =>
      listOutOfRangeCargoReadings(client, query.data.operating_company_id, {
        from: query.data.from,
        to: query.data.to,
        limit: query.data.limit,
      })
    );

    return reply.send({
      rows,
      count: rows.length,
      operating_company_id: query.data.operating_company_id,
    });
  });
}
