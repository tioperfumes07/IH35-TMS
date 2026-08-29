import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { setScopedCompanyContext } from "../_helpers/scoped-company-context.js";

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const unitParamsSchema = z.object({ id: z.string().uuid() });

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

/** Thin facade over docs.files + docs.file_links for unit profile Section 10. */
export async function registerUnitDocumentsRoutes(app: FastifyInstance) {
  app.get("/api/v1/mdata/units/:id/documents", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = authed(req, reply);
    if (!authUser) return;
    const params = unitParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) return reply.code(400).send({ error: "validation_error" });

    const documents = await withCurrentUser(authUser.uuid, async (client) => {
      await setScopedCompanyContext(client, authUser.uuid, query.data.operating_company_id);
      // FLEET-F6118: child-only docs lookup returned documents:[] for unknown/other-company units.
      // Prove the unit is owned or currently leased by this company before reporting true zero docs.
      const unit = await client.query(
        `SELECT 1
           FROM mdata.units
          WHERE id = $1::uuid
            AND (owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid)
          LIMIT 1`,
        [params.data.id, query.data.operating_company_id]
      );
      if (unit.rowCount === 0) return null;
      const res = await client.query(
        `
          SELECT
            f.id::text AS file_id,
            f.original_filename AS name,
            fc.code AS category,
            f.expiration_date::text AS expiration_date,
            f.created_at::text AS uploaded_at,
            f.r2_key AS url,
            f.mime_type
          FROM docs.file_links fl
          JOIN docs.files f ON f.id = fl.file_id
          LEFT JOIN catalogs.file_categories fc ON fc.id = f.category_id
          WHERE fl.entity_type = 'unit'
            AND fl.entity_id = $1::uuid
            AND fl.deleted_at IS NULL
            AND f.deleted_at IS NULL
            AND f.upload_completed_at IS NOT NULL
            AND f.operating_company_id = $2::uuid
          ORDER BY f.created_at DESC
        `,
        [params.data.id, query.data.operating_company_id]
      );
      return res.rows;
    });
    if (documents === null) return reply.code(404).send({ error: "mdata_unit_not_found" });
    return { documents };
  });
}
