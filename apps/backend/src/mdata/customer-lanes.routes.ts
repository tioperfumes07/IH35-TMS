import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const paramsSchema = z.object({
  customer_id: z.string().uuid(),
});

const laneParamsSchema = paramsSchema.extend({
  lane_id: z.string().uuid(),
});

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  include_inactive: z.enum(["true", "false"]).optional(),
});

const createLaneSchema = z.object({
  lane_label: z.string().trim().min(1).max(150),
  origin_city: z.string().trim().min(1).max(120),
  origin_state: z.string().trim().min(1).max(12),
  destination_city: z.string().trim().min(1).max(120),
  destination_state: z.string().trim().min(1).max(12),
  typical_miles: z.number().int().min(0).max(5000).optional(),
  base_rate_cents: z.number().int().nonnegative(),
  fsc_per_mile_cents: z.number().int().nonnegative().optional(),
  accessorials: z.array(z.object({ label: z.string(), amount_cents: z.number().int().nonnegative() })).optional(),
  notes: z.string().trim().max(2000).optional(),
});

const updateLaneSchema = z
  .object({
    lane_label: z.string().trim().min(1).max(150).optional(),
    origin_city: z.string().trim().min(1).max(120).optional(),
    origin_state: z.string().trim().min(1).max(12).optional(),
    destination_city: z.string().trim().min(1).max(120).optional(),
    destination_state: z.string().trim().min(1).max(12).optional(),
    typical_miles: z.number().int().min(0).max(5000).nullable().optional(),
    base_rate_cents: z.number().int().nonnegative().optional(),
    fsc_per_mile_cents: z.number().int().nonnegative().nullable().optional(),
    accessorials: z.array(z.object({ label: z.string(), amount_cents: z.number().int().nonnegative() })).optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "at least one field is required" });

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function canManageLanes(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Manager";
}

export async function registerCustomerLanesRoutes(app: FastifyInstance) {
  app.get("/api/v1/mdata/customers/:customer_id/lanes", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = paramsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = querySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    return withCurrentUser(authUser.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1, true)", [parsedQuery.data.operating_company_id]);
      const includeInactive = parsedQuery.data.include_inactive === "true";
      const rowsRes = await client.query(
        `
          SELECT *
          FROM mdata.customer_lanes
          WHERE customer_id = $1
            AND operating_company_id = $2
            ${includeInactive ? "" : "AND deactivated_at IS NULL"}
          ORDER BY updated_at DESC
        `,
        [parsedParams.data.customer_id, parsedQuery.data.operating_company_id]
      );
      return { lanes: rowsRes.rows };
    });
  });

  app.post("/api/v1/mdata/customers/:customer_id/lanes", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!canManageLanes(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = paramsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = querySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const parsedBody = createLaneSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    return withCurrentUser(authUser.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1, true)", [parsedQuery.data.operating_company_id]);
      const res = await client.query(
        `
          INSERT INTO mdata.customer_lanes (
            operating_company_id, customer_id, lane_label, origin_city, origin_state, destination_city, destination_state,
            typical_miles, base_rate_cents, fsc_per_mile_cents, accessorials, notes
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)
          RETURNING *
        `,
        [
          parsedQuery.data.operating_company_id,
          parsedParams.data.customer_id,
          parsedBody.data.lane_label,
          parsedBody.data.origin_city,
          parsedBody.data.origin_state,
          parsedBody.data.destination_city,
          parsedBody.data.destination_state,
          parsedBody.data.typical_miles ?? null,
          parsedBody.data.base_rate_cents,
          parsedBody.data.fsc_per_mile_cents ?? null,
          JSON.stringify(parsedBody.data.accessorials ?? []),
          parsedBody.data.notes ?? null,
        ]
      );
      const lane = res.rows[0];
      await appendCrudAudit(
        client,
        authUser.uuid,
        "mdata.customer_lanes.created",
        { resource_id: lane.id, resource_type: "mdata.customer_lanes", customer_id: parsedParams.data.customer_id },
        "info",
        "P3-T11.17.7-CUSTOMER-DETAIL-BACKEND"
      );
      return reply.code(201).send({ lane });
    });
  });

  app.patch("/api/v1/mdata/customers/:customer_id/lanes/:lane_id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!canManageLanes(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = laneParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = querySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const parsedBody = updateLaneSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    return withCurrentUser(authUser.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1, true)", [parsedQuery.data.operating_company_id]);
      const fields: string[] = [];
      const values: unknown[] = [];
      for (const [key, value] of Object.entries(parsedBody.data)) {
        if (value !== undefined) {
          values.push(key === "accessorials" ? JSON.stringify(value) : value);
          fields.push(`${key} = $${values.length}${key === "accessorials" ? "::jsonb" : ""}`);
        }
      }
      fields.push("updated_at = now()");
      values.push(parsedParams.data.lane_id, parsedParams.data.customer_id, parsedQuery.data.operating_company_id);
      const res = await client.query(
        `
          UPDATE mdata.customer_lanes
          SET ${fields.join(", ")}
          WHERE id = $${values.length - 2}
            AND customer_id = $${values.length - 1}
            AND operating_company_id = $${values.length}
          RETURNING *
        `,
        values
      );
      const lane = res.rows[0];
      if (!lane) return reply.code(404).send({ error: "customer_lane_not_found" });
      await appendCrudAudit(
        client,
        authUser.uuid,
        "mdata.customer_lanes.updated",
        { resource_id: lane.id, resource_type: "mdata.customer_lanes", customer_id: parsedParams.data.customer_id },
        "info",
        "P3-T11.17.7-CUSTOMER-DETAIL-BACKEND"
      );
      return { lane };
    });
  });

  app.delete("/api/v1/mdata/customers/:customer_id/lanes/:lane_id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!canManageLanes(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = laneParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = querySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    return withCurrentUser(authUser.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1, true)", [parsedQuery.data.operating_company_id]);
      const res = await client.query(
        `
          UPDATE mdata.customer_lanes
          SET deactivated_at = now(), updated_at = now()
          WHERE id = $1
            AND customer_id = $2
            AND operating_company_id = $3
            AND deactivated_at IS NULL
          RETURNING id
        `,
        [parsedParams.data.lane_id, parsedParams.data.customer_id, parsedQuery.data.operating_company_id]
      );
      if (res.rows.length === 0) return reply.code(404).send({ error: "customer_lane_not_found" });
      await appendCrudAudit(
        client,
        authUser.uuid,
        "mdata.customer_lanes.deactivated",
        { resource_id: parsedParams.data.lane_id, resource_type: "mdata.customer_lanes", customer_id: parsedParams.data.customer_id },
        "info",
        "P3-T11.17.7-CUSTOMER-DETAIL-BACKEND"
      );
      return reply.code(204).send();
    });
  });
}
