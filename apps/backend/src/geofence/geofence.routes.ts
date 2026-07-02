/**
 * Geofence routes — W3A-GEOFENCE-ENGINE (Fastify)
 * Fence CRUD + event recording. Extends GAP-54/55/56 groundwork.
 * Enter/exit events written to geofence.event; spine logged via trigger.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

const FenceCreateSchema = z.object({
  operating_company_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  center_lat: z.coerce.number().min(-90).max(90),
  center_lng: z.coerce.number().min(-180).max(180),
  radius_meters: z.coerce.number().int().min(50).max(50000),
  fence_type: z.enum(["yard", "customer", "custom", "border_crossing"]).default("custom"),
});

const EventRecordSchema = z.object({
  operating_company_id: z.string().uuid(),
  fence_id: z.string().uuid(),
  unit_id: z.string().uuid(),
  load_id: z.string().uuid().optional(),
  event_type: z.enum(["enter", "exit", "dwell_exceeded", "left_yard_without_load"]),
  occurred_at: z.string().datetime().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  dwell_seconds: z.coerce.number().int().optional(),
});

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user!;
}

export default async function geofenceRoutes(fastify: FastifyInstance) {
  // GET /geofence/fences — list fences for a company
  fastify.get("/fences", async (request, reply) => {
    const user = authUser(request, reply);
    if (!user) return;

    const { operating_company_id } = z
      .object({ operating_company_id: z.string().uuid() })
      .parse(request.query);

    return withCurrentUser(user.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1, true)", [operating_company_id]);
      const result = await (client as Queryable).query(
        `SELECT * FROM geofence.fence
         WHERE operating_company_id = $1 AND is_active = true AND soft_deleted_at IS NULL
         ORDER BY name`,
        [operating_company_id]
      );
      return { fences: result.rows };
    });
  });

  // POST /geofence/fences — create fence
  fastify.post("/fences", async (request, reply) => {
    const user = authUser(request, reply);
    if (!user) return;

    const input = FenceCreateSchema.parse(request.body);

    return withCurrentUser(user.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1, true)", [input.operating_company_id]);
      const result = await (client as Queryable).query(
        `INSERT INTO geofence.fence
           (operating_company_id, name, center_lat, center_lng, radius_meters, fence_type, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          input.operating_company_id,
          input.name,
          input.center_lat,
          input.center_lng,
          input.radius_meters,
          input.fence_type,
          user.uuid,
        ]
      );
      reply.status(201);
      return { fence: result.rows[0] };
    });
  });

  // DELETE /geofence/fences/:id — soft-delete fence
  fastify.delete("/fences/:id", async (request, reply) => {
    const user = authUser(request, reply);
    if (!user) return;

    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { operating_company_id } = z
      .object({ operating_company_id: z.string().uuid() })
      .parse(request.query);

    return withCurrentUser(user.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1, true)", [operating_company_id]);
      const result = await (client as Queryable).query(
        `UPDATE geofence.fence
         SET soft_deleted_at = now(), is_active = false
         WHERE id = $1 AND operating_company_id = $2
         RETURNING id`,
        [id, operating_company_id]
      );
      if (result.rows.length === 0) {
        reply.status(404);
        return { error: "Fence not found" };
      }
      return { deleted: true };
    });
  });

  // POST /geofence/events — record enter/exit event
  fastify.post("/events", async (request, reply) => {
    const user = authUser(request, reply);
    if (!user) return;

    const input = EventRecordSchema.parse(request.body);

    return withCurrentUser(user.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1, true)", [input.operating_company_id]);
      const result = await (client as Queryable).query(
        `INSERT INTO geofence.event
           (operating_company_id, fence_id, unit_id, load_id, event_type, occurred_at, lat, lng, dwell_seconds)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, now()), $7, $8, $9)
         RETURNING *`,
        [
          input.operating_company_id,
          input.fence_id,
          input.unit_id,
          input.load_id ?? null,
          input.event_type,
          input.occurred_at ?? null,
          input.lat ?? null,
          input.lng ?? null,
          input.dwell_seconds ?? null,
        ]
      );
      reply.status(201);
      return { event: result.rows[0] };
    });
  });

  // GET /geofence/events — list recent events for a unit or fence
  fastify.get("/events", async (request, reply) => {
    const user = authUser(request, reply);
    if (!user) return;

    const { operating_company_id, unit_id, fence_id, limit } = z
      .object({
        operating_company_id: z.string().uuid(),
        unit_id: z.string().uuid().optional(),
        fence_id: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      })
      .parse(request.query);

    return withCurrentUser(user.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1, true)", [operating_company_id]);
      const result = await (client as Queryable).query(
        `SELECT e.*, f.name AS fence_name
         FROM geofence.event e
         JOIN geofence.fence f ON f.id = e.fence_id
         WHERE e.operating_company_id = $1
           AND ($2::uuid IS NULL OR e.unit_id = $2::uuid)
           AND ($3::uuid IS NULL OR e.fence_id = $3::uuid)
         ORDER BY e.occurred_at DESC
         LIMIT $4`,
        [operating_company_id, unit_id ?? null, fence_id ?? null, limit]
      );
      return { events: result.rows };
    });
  });
}
