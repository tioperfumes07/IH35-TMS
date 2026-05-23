import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireDriverSession } from "./auth.js";

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

const respondBodySchema = z.object({
  response: z.enum(["confirmed", "overridden", "dismissed", "expired"]),
  note: z.string().trim().max(1000).optional(),
});

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function registerDriverStatusSuggestionsRoutes(app: FastifyInstance) {
  app.get("/api/v1/driver/status-suggestions", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const driver = req.driver;
    const user = req.user;
    if (!driver || !user) return reply.code(403).send({ error: "forbidden" });

    const rows = await withCurrentUser(user.uuid, async (client) => {
      const companyRes = await client.query<{ operating_company_id: string | null }>(
        `SELECT operating_company_id::text FROM mdata.drivers WHERE id = $1::uuid LIMIT 1`,
        [driver.id]
      );
      const operatingCompanyId = companyRes.rows[0]?.operating_company_id ?? null;
      if (!operatingCompanyId) return [];

      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
      const res = await client.query(
        `
          WITH latest_response AS (
            SELECT DISTINCT ON (r.suggestion_id)
              r.suggestion_id,
              r.response
            FROM dispatch.auto_status_suggestion_responses r
            WHERE r.operating_company_id = $1::uuid
            ORDER BY r.suggestion_id, r.response_at DESC
          )
          SELECT
            s.id::text,
            s.load_id::text,
            l.load_number,
            s.suggested_from,
            s.suggested_to,
            s.reason,
            s.suggested_at::text
          FROM dispatch.auto_status_suggestions s
          JOIN mdata.loads l ON l.id = s.load_id
          LEFT JOIN latest_response lr ON lr.suggestion_id = s.id
          WHERE s.operating_company_id = $1::uuid
            AND s.driver_id = $2::uuid
            AND lr.suggestion_id IS NULL
            AND s.suggested_at >= now() - interval '24 hours'
          ORDER BY s.suggested_at DESC
          LIMIT 10
        `,
        [operatingCompanyId, driver.id]
      );
      return res.rows;
    });

    return { suggestions: rows };
  });

  app.post("/api/v1/driver/status-suggestions/:id/respond", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const driver = req.driver;
    const user = req.user;
    if (!driver || !user) return reply.code(403).send({ error: "forbidden" });

    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = respondBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const result = await withCurrentUser(user.uuid, async (client) => {
      const companyRes = await client.query<{ operating_company_id: string | null }>(
        `SELECT operating_company_id::text FROM mdata.drivers WHERE id = $1::uuid LIMIT 1`,
        [driver.id]
      );
      const operatingCompanyId = companyRes.rows[0]?.operating_company_id ?? null;
      if (!operatingCompanyId) return false;
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);

      const suggestion = await client.query(
        `
          SELECT id::text
          FROM dispatch.auto_status_suggestions
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
            AND driver_id = $3::uuid
          LIMIT 1
        `,
        [params.data.id, operatingCompanyId, driver.id]
      );
      if (!suggestion.rows[0]) return false;

      await client.query(
        `
          INSERT INTO dispatch.auto_status_suggestion_responses (
            operating_company_id,
            suggestion_id,
            response,
            response_by_user_uuid,
            note
          )
          VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5)
        `,
        [operatingCompanyId, params.data.id, body.data.response, user.uuid, body.data.note ?? null]
      );
      return true;
    });

    if (!result) return reply.code(404).send({ error: "status_suggestion_not_found" });
    return { ok: true };
  });
}
