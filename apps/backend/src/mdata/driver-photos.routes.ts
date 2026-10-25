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
const driverParamsSchema = z.object({ id: z.string().uuid() });

const setPhotoSchema = z.object({
  docs_file_id: z.string().uuid(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

/** Resolve a stored photo_url value to a signed download URL.
 * If photo_url is "file:<uuid>", looks up docs.files.r2_key and generates a signed URL.
 * Returns null when the file is not found or R2 is not configured. */
async function resolvePhotoUrl(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: { r2_key: string }[] }> },
  photoUrl: string | null
): Promise<string | null> {
  if (!photoUrl) return null;
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
  // Legacy raw URL — return as-is (backwards compat)
  return photoUrl;
}

export async function registerDriverPhotosRoutes(app: FastifyInstance) {
  // GET photo candidates — docs.files linked to this driver
  app.get(
    "/api/v1/mdata/drivers/:id/photo-candidates",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const authUser = authed(req, reply);
      if (!authUser) return reply;
      const params = driverParamsSchema.safeParse(req.params ?? {});
      const query = companyQuerySchema.safeParse(req.query ?? {});
      if (!params.success || !query.success) return reply.code(400).send({ error: "validation_error" });

      const candidates = await withCurrentUser(authUser.uuid, async (client) => {
        await setScopedCompanyContext(client, authUser.uuid, query.data.operating_company_id);
        const res = await client.query<{ id: string; original_filename: string; r2_key: string; created_at: string }>(
          `SELECT f.id::text, f.original_filename, f.r2_key, f.created_at::text
             FROM docs.file_links fl
             JOIN docs.files f ON f.id = fl.file_id
            WHERE fl.entity_type = 'driver'
              AND fl.entity_id = $1::uuid
              AND fl.deleted_at IS NULL
              AND f.deleted_at IS NULL
              AND f.upload_completed_at IS NOT NULL
              AND f.operating_company_id = $2::uuid
              AND f.r2_key IS NOT NULL
            ORDER BY f.created_at DESC
            LIMIT 20`,
          [params.data.id, query.data.operating_company_id]
        );
        const rows: { id: string; original_filename: string; signed_url: string | null; created_at: string }[] = [];
        for (const row of res.rows) {
          const signed_url = isR2Configured()
            ? (await generatePresignedDownloadUrl(row.r2_key, SIGNED_TTL_SECONDS)).url
            : null;
          rows.push({ id: row.id, original_filename: row.original_filename, signed_url, created_at: row.created_at });
        }
        return rows;
      });
      return { candidates };
    }
  );

  // GET current photo as a signed URL
  app.get(
    "/api/v1/mdata/drivers/:id/photo",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const authUser = authed(req, reply);
      if (!authUser) return reply;
      const params = driverParamsSchema.safeParse(req.params ?? {});
      const query = companyQuerySchema.safeParse(req.query ?? {});
      if (!params.success || !query.success) return reply.code(400).send({ error: "validation_error" });

      const result = await withCurrentUser(authUser.uuid, async (client) => {
        await setScopedCompanyContext(client, authUser.uuid, query.data.operating_company_id);
        const res = await client.query<{ photo_url: string | null }>(
          `SELECT photo_url FROM mdata.drivers WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
          [params.data.id, query.data.operating_company_id]
        );
        if (!res.rows[0]) return null;
        const signed_url = await resolvePhotoUrl(client as Parameters<typeof resolvePhotoUrl>[0], res.rows[0].photo_url);
        return { photo_url: res.rows[0].photo_url, signed_url };
      });
      if (!result) return reply.code(404).send({ error: "driver_not_found" });
      return result;
    }
  );

  // POST set driver profile photo from a docs.files id
  app.post(
    "/api/v1/mdata/drivers/:id/photo",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const authUser = authed(req, reply);
      if (!authUser) return reply;
      const params = driverParamsSchema.safeParse(req.params ?? {});
      const query = companyQuerySchema.safeParse(req.query ?? {});
      const body = setPhotoSchema.safeParse(req.body ?? {});
      if (!params.success || !query.success || !body.success) return reply.code(400).send({ error: "validation_error" });

      const result = await withCurrentUser(authUser.uuid, async (client) => {
        await setScopedCompanyContext(client, authUser.uuid, query.data.operating_company_id);
        // Verify the file exists and is accessible for this company
        const fileCheck = await client.query(
          `SELECT 1 FROM docs.files WHERE id = $1::uuid AND operating_company_id = $2::uuid AND deleted_at IS NULL AND upload_completed_at IS NOT NULL LIMIT 1`,
          [body.data.docs_file_id, query.data.operating_company_id]
        );
        if ((fileCheck.rowCount ?? 0) === 0) return null;
        const photoRef = `${PHOTO_URL_PREFIX}${body.data.docs_file_id}`;
        const res = await client.query<{ id: string }>(
          `UPDATE mdata.drivers SET photo_url = $1, updated_at = now() WHERE id = $2::uuid AND operating_company_id = $3::uuid RETURNING id::text`,
          [photoRef, params.data.id, query.data.operating_company_id]
        );
        if (!res.rows[0]) return null;
        await appendCrudAudit(client, authUser.uuid, "mdata.drivers.photo.set", {
          resource_id: params.data.id,
          resource_type: "mdata.drivers",
          docs_file_id: body.data.docs_file_id,
        });
        return { driver_id: res.rows[0].id };
      });
      if (!result) return reply.code(404).send({ error: "driver_or_file_not_found" });
      return result;
    }
  );

  // DELETE clear driver profile photo
  app.delete(
    "/api/v1/mdata/drivers/:id/photo",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const authUser = authed(req, reply);
      if (!authUser) return reply;
      const params = driverParamsSchema.safeParse(req.params ?? {});
      const query = companyQuerySchema.safeParse(req.query ?? {});
      if (!params.success || !query.success) return reply.code(400).send({ error: "validation_error" });

      const result = await withCurrentUser(authUser.uuid, async (client) => {
        await setScopedCompanyContext(client, authUser.uuid, query.data.operating_company_id);
        const res = await client.query<{ id: string }>(
          `UPDATE mdata.drivers SET photo_url = NULL, updated_at = now() WHERE id = $1::uuid AND operating_company_id = $2::uuid RETURNING id::text`,
          [params.data.id, query.data.operating_company_id]
        );
        if (!res.rows[0]) return null;
        await appendCrudAudit(client, authUser.uuid, "mdata.drivers.photo.cleared", {
          resource_id: params.data.id,
          resource_type: "mdata.drivers",
        });
        return { driver_id: res.rows[0].id };
      });
      if (!result) return reply.code(404).send({ error: "driver_not_found" });
      return result;
    }
  );
}
