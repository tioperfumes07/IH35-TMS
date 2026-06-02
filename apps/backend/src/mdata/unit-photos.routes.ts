import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const unitParamsSchema = z.object({ id: z.string().uuid() });
const photoParamsSchema = z.object({ id: z.string().uuid(), photo_id: z.string().uuid() });

const createPhotoSchema = z.object({
  photo_url: z.string().url(),
  photo_type: z.enum(["damage", "cleanliness", "mod", "interior", "exterior", "other"]),
  caption: z.string().trim().max(2000).optional(),
  taken_at: z.string().datetime().optional(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerUnitPhotosRoutes(app: FastifyInstance) {
  app.get("/api/v1/mdata/units/:id/photos", async (req, reply) => {
    const authUser = authed(req, reply);
    if (!authUser) return;
    const params = unitParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) return reply.code(400).send({ error: "validation_error" });

    const rows = await withCurrentUser(authUser.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const res = await client.query(
        `
          SELECT id::text, photo_url, photo_type, caption, taken_at::text, created_at::text
          FROM mdata.unit_photos
          WHERE unit_id = $1::uuid AND operating_company_id = $2::uuid AND archived_at IS NULL
          ORDER BY taken_at DESC NULLS LAST, created_at DESC
        `,
        [params.data.id, query.data.operating_company_id]
      );
      return res.rows;
    });
    return { photos: rows };
  });

  app.post("/api/v1/mdata/units/:id/photos", async (req, reply) => {
    const authUser = authed(req, reply);
    if (!authUser) return;
    const params = unitParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    const body = createPhotoSchema.safeParse(req.body ?? {});
    if (!params.success || !query.success || !body.success) return reply.code(400).send({ error: "validation_error" });

    const row = await withCurrentUser(authUser.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const res = await client.query(
        `
          INSERT INTO mdata.unit_photos (
            operating_company_id, unit_id, uploaded_by_user_id, photo_url, photo_type, caption, taken_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, now()))
          RETURNING id::text, photo_url, photo_type, caption, taken_at::text
        `,
        [
          query.data.operating_company_id,
          params.data.id,
          authUser.uuid,
          body.data.photo_url,
          body.data.photo_type,
          body.data.caption ?? null,
          body.data.taken_at ?? null,
        ]
      );
      const created = res.rows[0];
      await appendCrudAudit(client, authUser.uuid, "mdata.unit_photos.created", {
        resource_id: created.id,
        resource_type: "mdata.unit_photos",
        unit_id: params.data.id,
      });
      return created;
    });
    return reply.code(201).send(row);
  });

  app.post("/api/v1/mdata/units/:id/photos/:photo_id/archive", async (req, reply) => {
    const authUser = authed(req, reply);
    if (!authUser) return;
    const params = photoParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) return reply.code(400).send({ error: "validation_error" });

    const row = await withCurrentUser(authUser.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const res = await client.query(
        `
          UPDATE mdata.unit_photos
          SET archived_at = now()
          WHERE id = $1::uuid AND unit_id = $2::uuid AND operating_company_id = $3::uuid AND archived_at IS NULL
          RETURNING id::text
        `,
        [params.data.photo_id, params.data.id, query.data.operating_company_id]
      );
      if (!res.rows[0]) return null;
      await appendCrudAudit(client, authUser.uuid, "mdata.unit_photos.archived", {
        resource_id: params.data.photo_id,
        resource_type: "mdata.unit_photos",
        unit_id: params.data.id,
      });
      return res.rows[0];
    });
    if (!row) return reply.code(404).send({ error: "photo_not_found" });
    return row;
  });
}
