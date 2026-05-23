import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { getCurrentClocks } from "./hos-clocks.service.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const paramsSchema = z.object({
  driver_id: z.string().uuid(),
});

function currentUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function registerTelematicsHosRoutes(app: FastifyInstance) {
  app.get("/api/v1/telematics/drivers/:driver_id/hos", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const params = paramsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const payload = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      await client.query(`SELECT set_config('app.user_role', $1, true)`, [user.role]);

      const driverRes = await client.query<{ id: string }>(
        `
          SELECT id::text AS id
          FROM mdata.drivers
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
          LIMIT 1
        `,
        [params.data.driver_id, query.data.operating_company_id]
      );
      if (!driverRes.rows[0]) return null;

      const clocks = await getCurrentClocks(client, query.data.operating_company_id, params.data.driver_id);
      const events24hRes = await client.query<{
        id: string;
        duty_status: string;
        started_at: string;
        ended_at: string | null;
        unit_id: string | null;
        source: string;
        odometer_mi: number | null;
        location: string | null;
      }>(
        `
          SELECT
            id::text,
            duty_status,
            started_at::text,
            ended_at::text,
            unit_id::text,
            source,
            odometer_mi,
            location
          FROM hos.duty_status_events
          WHERE operating_company_id = $1::uuid
            AND driver_id = $2::uuid
            AND started_at >= now() - interval '24 hours'
          ORDER BY started_at DESC
        `,
        [query.data.operating_company_id, params.data.driver_id]
      );
      const summary8dRes = await client.query<{
        service_day: string;
        duty_status: string;
        total_minutes: number;
      }>(
        `
          SELECT
            to_char(date_trunc('day', started_at), 'YYYY-MM-DD') AS service_day,
            duty_status,
            FLOOR(
              SUM(
                EXTRACT(
                  EPOCH FROM
                  (
                    LEAST(COALESCE(ended_at, now()), now())
                    - GREATEST(started_at, now() - interval '8 days')
                  )
                ) / 60.0
              )
            )::int AS total_minutes
          FROM hos.duty_status_events
          WHERE operating_company_id = $1::uuid
            AND driver_id = $2::uuid
            AND started_at < now()
            AND COALESCE(ended_at, now()) > now() - interval '8 days'
          GROUP BY 1, 2
          ORDER BY service_day DESC, duty_status
        `,
        [query.data.operating_company_id, params.data.driver_id]
      );
      const manualEditsRes = await client.query<{
        id: string;
        started_at: string;
        duty_status: string;
      }>(
        `
          SELECT id::text, started_at::text, duty_status
          FROM hos.duty_status_events
          WHERE operating_company_id = $1::uuid
            AND driver_id = $2::uuid
            AND source = 'manual_edit'
          ORDER BY started_at DESC
          LIMIT 100
        `,
        [query.data.operating_company_id, params.data.driver_id]
      );

      return {
        driver_id: params.data.driver_id,
        clocks,
        timeline_24h: events24hRes.rows,
        summary_8d: summary8dRes.rows,
        manual_edits: {
          count: manualEditsRes.rows.length,
          requires_supervisor_signoff: true,
          events: manualEditsRes.rows,
        },
      };
    });

    if (!payload) return reply.code(404).send({ error: "driver_not_found" });
    return payload;
  });
}
