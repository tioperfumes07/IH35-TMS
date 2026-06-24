import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const incidentTypeSchema = z.enum(["damage_report", "trailer_interchange", "cargo_claim"]);

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const listQuerySchema = companyQuerySchema.extend({
  incident_type: incidentTypeSchema,
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

const createBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  incident_type: incidentTypeSchema,
  incident_at: z.string().datetime({ offset: true }).optional(),
  location: z.string().max(500).default(""),
  description: z.string().max(4000).default(""),
  driver_id: z.string().uuid().nullable().optional(),
  unit_id: z.string().uuid().nullable().optional(),
  trailer_id: z.string().uuid().nullable().optional(),
  load_id: z.string().uuid().nullable().optional(),
  interchange_party: z.string().max(200).nullable().optional(),
  damage_amount_cents: z.coerce.number().int().min(0).default(0),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: {
    query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
  }) => Promise<T>
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${operatingCompanyId}'`);
    return fn(client);
  });
}

function isSafetyMutationAllowed(role: string) {
  return ["Owner", "Administrator", "Manager", "Safety"].includes(role);
}

export async function registerSafetyIncidentsRoutes(app: FastifyInstance) {
  app.get("/api/v1/safety/incidents", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT i.*, u.unit_number
          FROM safety.incidents i
          LEFT JOIN mdata.units u ON u.id = i.unit_id
          WHERE i.operating_company_id = $1
            AND i.incident_type = $2
          ORDER BY i.incident_at DESC
          LIMIT $3 OFFSET $4
        `,
        [query.data.operating_company_id, query.data.incident_type, query.data.limit, query.data.offset]
      );
      return res.rows;
    });

    return { incidents: rows };
  });

  app.get("/api/v1/safety/incidents/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const row = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT *
          FROM safety.incidents
          WHERE id = $1
            AND operating_company_id = $2
          LIMIT 1
        `,
        [params.data.id, query.data.operating_company_id]
      );
      return res.rows[0] ?? null;
    });

    if (!row) return reply.code(404).send({ error: "incident_not_found" });
    return { incident: row };
  });

  app.post("/api/v1/safety/incidents", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isSafetyMutationAllowed(user.role)) return reply.code(403).send({ error: "forbidden" });
    const body = createBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const created = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          INSERT INTO safety.incidents (
            operating_company_id,
            incident_type,
            incident_at,
            location,
            description,
            driver_id,
            unit_id,
            trailer_id,
            load_id,
            interchange_party,
            damage_amount_cents
          )
          VALUES (
            $1, $2,
            COALESCE($3::timestamptz, now()),
            $4, $5, $6, $7, $8, $9, $10, $11
          )
          RETURNING *
        `,
        [
          body.data.operating_company_id,
          body.data.incident_type,
          body.data.incident_at ?? null,
          body.data.location,
          body.data.description,
          body.data.driver_id ?? null,
          body.data.unit_id ?? null,
          body.data.trailer_id ?? null,
          body.data.load_id ?? null,
          body.data.interchange_party ?? null,
          body.data.damage_amount_cents,
        ]
      );
      const row = res.rows[0];
      if (!row) return null;
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.incident.created",
        {
          resource_type: "safety.incidents",
          resource_id: row.id,
          incident_type: body.data.incident_type,
          operating_company_id: body.data.operating_company_id,
        },
        "info",
        "A23-7-INCIDENTS-CLUSTER"
      );
      return row;
    });

    if (!created) return reply.code(500).send({ error: "create_failed" });
    return reply.code(201).send({ incident: created });
  });

  app.post("/api/v1/safety/incidents/:id/photos", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isSafetyMutationAllowed(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "file_required" });

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const photoKey = `incidents/${params.data.id}/${file.filename ?? "photo"}`;
      const res = await client.query(
        `
          UPDATE safety.incidents
          SET photo_keys = array_append(photo_keys, $3),
              updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2
            AND cardinality(photo_keys) < 10
          RETURNING id, photo_keys
        `,
        [params.data.id, query.data.operating_company_id, photoKey]
      );
      if (!res.rows[0]) return null;
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.incident.photo_added",
        {
          resource_type: "safety.incidents",
          resource_id: params.data.id,
          photo_key: photoKey,
          operating_company_id: query.data.operating_company_id,
        },
        "info",
        "A23-7-INCIDENTS-CLUSTER"
      );
      return {
        incident_id: params.data.id,
        photo_key: photoKey,
        photo_keys: res.rows[0].photo_keys,
      };
    });

    if (!result) return reply.code(404).send({ error: "incident_not_found" });
    return result;
  });
}
