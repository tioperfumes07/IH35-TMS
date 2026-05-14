import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import {
  companyQuerySchema,
  idParamSchema,
  validationError,
  withCompanyScope,
} from "../catalogs/maintenance/shared.js";
import { requireAuth } from "../auth/session-middleware.js";

const listQuerySchema = companyQuerySchema.extend({
  status: z.enum(["submitted", "under_review", "resolved", "dismissed"]).optional(),
});

const patchBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  status: z.enum(["under_review", "resolved", "dismissed"]),
  resolution_notes: z.string().max(8000).optional().nullable(),
});

function authed(req: Parameters<typeof requireAuth>[0], reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user!;
}

export async function registerMaintenanceDriverReportsRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/driver-reports", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const values: unknown[] = [query.data.operating_company_id];
      let sql = `
        SELECT
          r.id,
          r.operating_company_id,
          r.driver_id,
          concat_ws(' ', d.first_name, d.last_name) AS driver_name,
          r.load_id,
          l.load_number AS load_number,
          r.report_type,
          r.description,
          r.photo_r2_paths,
          r.voice_memo_r2_path,
          r.latitude,
          r.longitude,
          r.reported_at,
          r.status,
          r.reviewed_by_user_id,
          r.reviewed_at,
          r.resolution_notes,
          r.created_at,
          r.updated_at
        FROM maintenance.driver_reports r
        LEFT JOIN mdata.drivers d ON d.id = r.driver_id
        LEFT JOIN mdata.loads l ON l.id = r.load_id
        WHERE r.operating_company_id = $1
      `;
      if (query.data.status) {
        values.push(query.data.status);
        sql += ` AND r.status = $${values.length}`;
      }
      sql += ` ORDER BY r.reported_at DESC LIMIT 500`;
      const res = await client.query(sql, values);
      return res.rows;
    });

    return { rows };
  });

  app.patch("/api/v1/maintenance/driver-reports/:id", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = patchBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const updated = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE maintenance.driver_reports
          SET status = $3,
              resolution_notes = COALESCE($4, resolution_notes),
              reviewed_by_user_id = CASE WHEN $3 IN ('resolved','under_review','dismissed') THEN COALESCE(reviewed_by_user_id, $5::uuid) ELSE reviewed_by_user_id END,
              reviewed_at = CASE WHEN $3 IN ('resolved','dismissed') AND reviewed_at IS NULL THEN now() WHEN $3 = 'under_review' THEN now() ELSE reviewed_at END,
              updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2
          RETURNING *
        `,
        [
          params.data.id,
          body.data.operating_company_id,
          body.data.status,
          body.data.resolution_notes ?? null,
          user.uuid,
        ]
      );
      return res.rows[0] ?? null;
    });

    if (!updated) return reply.code(404).send({ error: "not_found" });
    return updated;
  });
}
