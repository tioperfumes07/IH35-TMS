import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const locationKindSchema = z.enum(["customer_site", "yard", "vendor_site", "custom"]);

const listQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  is_active: z.coerce.boolean().optional(),
  location_kind: locationKindSchema.optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

const createBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  label: z.string().trim().min(1).max(200),
  location_kind: locationKindSchema,
  location_ref_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().optional(),
  polygon_geojson: z.object({
    type: z.literal("Polygon"),
    coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))).min(1),
  }),
});

const patchBodySchema = z
  .object({
    label: z.string().trim().min(1).max(200).optional(),
    location_kind: locationKindSchema.optional(),
    location_ref_id: z.string().uuid().nullable().optional(),
    is_active: z.boolean().optional(),
    polygon_geojson: z
      .object({
        type: z.literal("Polygon"),
        coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))).min(1),
      })
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "at least one field is required" });

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function isWriteRole(role: string): boolean {
  return role === "Owner" || role === "Administrator" || role === "Manager" || role === "Dispatcher";
}

export async function registerGeofencesRoutes(app: FastifyInstance) {
  app.get("/api/v1/telematics/geofences", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);

    const data = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [parsed.data.operating_company_id]);
      const filters: string[] = ["g.operating_company_id = $1::uuid"];
      const params: unknown[] = [parsed.data.operating_company_id];
      if (parsed.data.is_active !== undefined) {
        params.push(parsed.data.is_active);
        filters.push(`g.is_active = $${params.length}`);
      }
      if (parsed.data.location_kind) {
        params.push(parsed.data.location_kind);
        filters.push(`g.location_kind = $${params.length}`);
      }
      const whereSql = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
      const res = await client.query(
        `
          SELECT
            g.id::text,
            g.operating_company_id::text,
            g.label,
            g.location_kind,
            g.location_ref_id::text,
            g.is_active,
            ST_AsGeoJSON(g.polygon::geometry)::jsonb AS polygon_geojson,
            g.created_at::text,
            g.created_by_user_uuid::text,
            g.updated_at::text,
            g.updated_by_user_uuid::text
          FROM geo.geofences g
          ${whereSql}
          ORDER BY g.created_at DESC
        `,
        params
      );
      return res.rows;
    });

    return { geofences: data };
  });

  app.post("/api/v1/telematics/geofences", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isWriteRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const parsed = createBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);

    const created = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [parsed.data.operating_company_id]);
      const res = await client.query(
        `
          INSERT INTO geo.geofences (
            operating_company_id,
            label,
            location_kind,
            location_ref_id,
            polygon,
            is_active,
            created_by_user_uuid,
            updated_by_user_uuid
          )
          VALUES (
            $1::uuid,
            $2,
            $3,
            $4::uuid,
            ST_SetSRID(ST_GeomFromGeoJSON($5::text), 4326)::geography,
            $6,
            $7::uuid,
            $7::uuid
          )
          RETURNING
            id::text,
            operating_company_id::text,
            label,
            location_kind,
            location_ref_id::text,
            is_active,
            ST_AsGeoJSON(polygon::geometry)::jsonb AS polygon_geojson,
            created_at::text,
            created_by_user_uuid::text,
            updated_at::text,
            updated_by_user_uuid::text
        `,
        [
          parsed.data.operating_company_id,
          parsed.data.label,
          parsed.data.location_kind,
          parsed.data.location_ref_id ?? null,
          JSON.stringify(parsed.data.polygon_geojson),
          parsed.data.is_active ?? true,
          user.uuid,
        ]
      );
      return res.rows[0];
    });

    return reply.code(201).send(created);
  });

  app.patch("/api/v1/telematics/geofences/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isWriteRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = patchBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const setParts: string[] = [];
    const values: unknown[] = [];
    const add = (col: string, val: unknown) => {
      values.push(val);
      setParts.push(`${col} = $${values.length}`);
    };

    if ("label" in body.data) add("label", body.data.label);
    if ("location_kind" in body.data) add("location_kind", body.data.location_kind);
    if ("location_ref_id" in body.data) add("location_ref_id", body.data.location_ref_id ?? null);
    if ("is_active" in body.data) add("is_active", body.data.is_active);
    if ("polygon_geojson" in body.data && body.data.polygon_geojson) {
      values.push(JSON.stringify(body.data.polygon_geojson));
      setParts.push(`polygon = ST_SetSRID(ST_GeomFromGeoJSON($${values.length}::text), 4326)::geography`);
    }
    add("updated_by_user_uuid", user.uuid);
    values.push(params.data.id);
    const idIndex = values.length;

    const updated = await withCurrentUser(user.uuid, async (client) => {
      const res = await client.query(
        `
          UPDATE geo.geofences
          SET ${setParts.join(", ")}
          WHERE id = $${idIndex}::uuid
          RETURNING
            id::text,
            operating_company_id::text,
            label,
            location_kind,
            location_ref_id::text,
            is_active,
            ST_AsGeoJSON(polygon::geometry)::jsonb AS polygon_geojson,
            created_at::text,
            created_by_user_uuid::text,
            updated_at::text,
            updated_by_user_uuid::text
        `,
        values
      );
      return res.rows[0] ?? null;
    });

    if (!updated) return reply.code(404).send({ error: "geofence_not_found" });
    return updated;
  });
}
