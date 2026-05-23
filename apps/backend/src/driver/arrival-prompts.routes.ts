import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireDriverSession } from "./auth.js";

const confirmParamsSchema = z.object({
  id: z.string().uuid(),
});

const confirmBodySchema = z.object({
  confirmed_at: z.string().datetime({ offset: true }).optional(),
});

const dismissBodySchema = z.object({
  reason: z.string().trim().min(1).max(200).optional(),
});

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function registerDriverArrivalPromptsRoutes(app: FastifyInstance) {
  app.get("/api/v1/driver/arrival-prompts", async (req, reply) => {
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
      const res = await client.query<{
        id: string;
        stop_id: string;
        unit_id: string;
        triggered_at: string;
        distance_at_trigger_ft: number;
        stop_name: string | null;
        load_id: string;
        load_number: string | null;
      }>(
        `
          SELECT
            a.id::text,
            a.stop_id::text,
            a.unit_id::text,
            a.triggered_at::text,
            a.distance_at_trigger_ft,
            COALESCE(loc.location_name, s.address_line1, concat_ws(', ', s.city, s.state)) AS stop_name,
            l.id::text AS load_id,
            l.load_number
          FROM dispatch.stop_arrivals a
          JOIN mdata.load_stops s ON s.id = a.stop_id
          JOIN mdata.loads l ON l.id = s.load_id
          LEFT JOIN mdata.locations loc ON loc.id = s.location_id
          WHERE a.operating_company_id = $1::uuid
            AND a.driver_id = $2::uuid
            AND a.confirmed_at IS NULL
            AND a.triggered_at >= now() - interval '30 minutes'
            AND l.soft_deleted_at IS NULL
          ORDER BY a.triggered_at DESC
          LIMIT 10
        `,
        [operatingCompanyId, driver.id]
      );
      return res.rows;
    });

    return { prompts: rows };
  });

  app.post("/api/v1/driver/arrival-prompts/:id/confirm", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const driver = req.driver;
    const user = req.user;
    if (!driver || !user) return reply.code(403).send({ error: "forbidden" });

    const params = confirmParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = confirmBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const confirmedAt = body.data.confirmed_at ?? new Date().toISOString();
    const result = await withCurrentUser(user.uuid, async (client) => {
      const companyRes = await client.query<{ operating_company_id: string | null }>(
        `SELECT operating_company_id::text FROM mdata.drivers WHERE id = $1::uuid LIMIT 1`,
        [driver.id]
      );
      const operatingCompanyId = companyRes.rows[0]?.operating_company_id ?? null;
      if (!operatingCompanyId) return { updated: false };

      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);

      const res = await client.query<{ stop_id: string }>(
        `
          UPDATE dispatch.stop_arrivals a
          SET
            confirmed_at = $4::timestamptz,
            confirmed_by_driver_uuid = $3::uuid
          WHERE a.id = $1::uuid
            AND a.operating_company_id = $2::uuid
            AND a.driver_id = $5::uuid
            AND a.confirmed_at IS NULL
          RETURNING a.stop_id::text
        `,
        [params.data.id, operatingCompanyId, user.uuid, confirmedAt, driver.id]
      );

      const stopId = res.rows[0]?.stop_id ?? null;
      if (!stopId) return { updated: false };

      await client.query(
        `
          UPDATE mdata.load_stops
          SET
            actual_arrival_at = COALESCE(actual_arrival_at, $2::timestamptz),
            status = CASE WHEN status::text = 'pending' THEN 'arrived'::mdata.stop_status_enum ELSE status END
          WHERE id = $1::uuid
        `,
        [stopId, confirmedAt]
      );

      await appendCrudAudit(
        client,
        user.uuid,
        "dispatch.stop_arrival_confirmed",
        {
          resource_type: "dispatch.stop_arrivals",
          resource_id: params.data.id,
          driver_id: driver.id,
          confirmed_at: confirmedAt,
        },
        "info"
      );

      return { updated: true };
    });

    if (!result.updated) return reply.code(404).send({ error: "arrival_prompt_not_found" });
    return { ok: true };
  });

  app.post("/api/v1/driver/arrival-prompts/:id/dismiss", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const driver = req.driver;
    const user = req.user;
    if (!driver || !user) return reply.code(403).send({ error: "forbidden" });

    const params = confirmParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = dismissBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    await withCurrentUser(user.uuid, async (client) => {
      const companyRes = await client.query<{ operating_company_id: string | null }>(
        `SELECT operating_company_id::text FROM mdata.drivers WHERE id = $1::uuid LIMIT 1`,
        [driver.id]
      );
      const operatingCompanyId = companyRes.rows[0]?.operating_company_id ?? null;
      if (!operatingCompanyId) return;

      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
      await appendCrudAudit(
        client,
        user.uuid,
        "dispatch.stop_arrival_dismissed",
        {
          resource_type: "dispatch.stop_arrivals",
          resource_id: params.data.id,
          driver_id: driver.id,
          reason: body.data.reason ?? null,
        },
        "info"
      );
    });

    return { ok: true };
  });
}
