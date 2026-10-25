import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { setScopedCompanyContext } from "../_helpers/scoped-company-context.js";
import { generatePresignedDownloadUrl, isR2Configured } from "../storage/r2-client.js";

const PHOTO_URL_PREFIX = "file:";
const SIGNED_TTL_SECONDS = 3600;

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const unitParamsSchema = z.object({ id: z.string().uuid() });
const photoParamsSchema = z.object({ id: z.string().uuid(), photo_id: z.string().uuid() });

const createPhotoSchema = z.union([
  z.object({
    docs_file_id: z.string().uuid(),
    photo_type: z.enum(["damage", "cleanliness", "mod", "interior", "exterior", "other"]),
    caption: z.string().trim().max(2000).optional(),
    taken_at: z.string().datetime().optional(),
    is_primary: z.boolean().optional(),
  }),
  z.object({
    photo_url: z.string().url(),
    photo_type: z.enum(["damage", "cleanliness", "mod", "interior", "exterior", "other"]),
    caption: z.string().trim().max(2000).optional(),
    taken_at: z.string().datetime().optional(),
    is_primary: z.boolean().optional(),
  }),
]);

async function resolvePhotoRow(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: { r2_key: string }[] }> },
  photoUrl: string
): Promise<string | null> {
  if (photoUrl.startsWith(PHOTO_URL_PREFIX)) {
    const fileId = photoUrl.slice(PHOTO_URL_PREFIX.length);
    const res = await client.query(
      `SELECT r2_key FROM docs.files WHERE id = $1::uuid AND deleted_at IS NULL AND upload_completed_at IS NOT NULL LIMIT 1`,
      [fileId]
    );
    const r2Key = res.rows[0]?.r2_key;
    if (!r2Key || !isR2Configured()) return null;
    return (await generatePresignedDownloadUrl(r2Key, SIGNED_TTL_SECONDS)).url;
  }
  return photoUrl;
}

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerUnitPhotosRoutes(app: FastifyInstance) {
  app.get("/api/v1/mdata/units/:id/photos", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = authed(req, reply);
    if (!authUser) return reply;
    const params = unitParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) return reply.code(400).send({ error: "validation_error" });

    const rows = await withCurrentUser(authUser.uuid, async (client) => {
      await setScopedCompanyContext(client, authUser.uuid, query.data.operating_company_id);
      // FLEET-F6117: a child-only lookup returned photos:[] for an unknown or other-company unit.
      // Prove the unit is owned or currently leased by this company before reporting true zero photos.
      const unit = await client.query(
        `SELECT 1
           FROM mdata.units
          WHERE id = $1::uuid
            AND (owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid)
          LIMIT 1`,
        [params.data.id, query.data.operating_company_id]
      );
      if (unit.rowCount === 0) return null;
      const res = await client.query<{ id: string; photo_url: string; photo_type: string; caption: string | null; taken_at: string | null; created_at: string; is_primary: boolean }>(
        `
          SELECT id::text, photo_url, photo_type, caption, taken_at::text, created_at::text,
                 (row_number() OVER (ORDER BY taken_at ASC NULLS LAST, created_at ASC)) = 1 AS is_primary
          FROM mdata.unit_photos
          WHERE unit_id = $1::uuid AND operating_company_id = $2::uuid AND archived_at IS NULL
          ORDER BY taken_at DESC NULLS LAST, created_at DESC
        `,
        [params.data.id, query.data.operating_company_id]
      );
      const rows = [];
      for (const row of res.rows) {
        const signed_url = await resolvePhotoRow(client as Parameters<typeof resolvePhotoRow>[0], row.photo_url);
        rows.push({ ...row, signed_url });
      }
      return rows;
    });
    if (rows === null) return reply.code(404).send({ error: "mdata_unit_not_found" });
    return { photos: rows };
  });

  app.post("/api/v1/mdata/units/:id/photos", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = authed(req, reply);
    if (!authUser) return reply;
    const params = unitParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    const body = createPhotoSchema.safeParse(req.body ?? {});
    if (!params.success || !query.success || !body.success) return reply.code(400).send({ error: "validation_error" });

    const row = await withCurrentUser(authUser.uuid, async (client) => {
      await setScopedCompanyContext(client, authUser.uuid, query.data.operating_company_id);
      // Resolve photo_url: prefer docs_file_id (stored as "file:<uuid>"), fallback to raw URL
      let resolvedPhotoUrl: string;
      if ("docs_file_id" in body.data) {
        const fileCheck = await client.query(
          `SELECT 1 FROM docs.files WHERE id = $1::uuid AND operating_company_id = $2::uuid AND deleted_at IS NULL AND upload_completed_at IS NOT NULL LIMIT 1`,
          [body.data.docs_file_id, query.data.operating_company_id]
        );
        if ((fileCheck.rowCount ?? 0) === 0) return null;
        resolvedPhotoUrl = `${PHOTO_URL_PREFIX}${body.data.docs_file_id}`;
      } else {
        resolvedPhotoUrl = body.data.photo_url;
      }
      const res = await client.query<{ id: string; photo_url: string; photo_type: string; caption: string | null; taken_at: string }>(
        `
          INSERT INTO mdata.unit_photos (
            operating_company_id, unit_id, uploaded_by_user_id, photo_url, photo_type, caption, taken_at
          )
          SELECT $1::uuid, u.id, $3::uuid, $4, $5, $6, COALESCE($7::timestamptz, now())
          FROM mdata.units u
          WHERE u.id = $2::uuid
            AND (u.owner_company_id = $1::uuid OR u.currently_leased_to_company_id = $1::uuid)
          RETURNING id::text, photo_url, photo_type, caption, taken_at::text
        `,
        [
          query.data.operating_company_id,
          params.data.id,
          authUser.uuid,
          resolvedPhotoUrl,
          body.data.photo_type,
          body.data.caption ?? null,
          body.data.taken_at ?? null,
        ]
      );
      const created = res.rows[0];
      if (!created?.id) return null;
      await appendCrudAudit(client, authUser.uuid, "mdata.unit_photos.created", {
        resource_id: created.id,
        resource_type: "mdata.unit_photos",
        unit_id: params.data.id,
      });
      return created;
    });
    if (!row) return reply.code(404).send({ error: "mdata_unit_not_found" });
    return reply.code(201).send(row);
  });

  app.post("/api/v1/mdata/units/:id/photos/:photo_id/archive", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = authed(req, reply);
    if (!authUser) return reply;
    const params = photoParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) return reply.code(400).send({ error: "validation_error" });

    const row = await withCurrentUser(authUser.uuid, async (client) => {
      await setScopedCompanyContext(client, authUser.uuid, query.data.operating_company_id);
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
