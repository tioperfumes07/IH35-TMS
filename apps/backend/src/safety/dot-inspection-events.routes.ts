import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const listQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  follow_up_state: z.enum(["open", "reviewed", "citation", "clean"]).optional(),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

const followUpBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  follow_up_state: z.enum(["open", "reviewed", "citation", "clean"]),
  note: z.string().trim().max(1000).optional(),
});

function currentUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withCompanyScope<T>(userId: string, operatingCompanyId: string, fn: (client: any) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${operatingCompanyId}'`);
    return fn(client);
  });
}

export async function registerDotInspectionEventsRoutes(app: FastifyInstance) {
  app.get("/api/v1/safety/dot-inspection-events", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const events = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const params: unknown[] = [query.data.operating_company_id];
      let stateFilter = "";
      if (query.data.follow_up_state) {
        params.push(query.data.follow_up_state);
        stateFilter = `WHERE COALESCE(f.latest_state, e.follow_up_state) = $${params.length}`;
      }

      const res = await client.query(
        `
          WITH latest_followup AS (
            SELECT DISTINCT ON (f.dot_inspection_event_id)
              f.dot_inspection_event_id,
              f.follow_up_state AS latest_state,
              f.follow_up_by_user_uuid::text AS latest_user_uuid,
              f.created_at AS latest_at
            FROM compliance.dot_inspection_event_followups f
            WHERE f.operating_company_id = $1::uuid
            ORDER BY f.dot_inspection_event_id, f.created_at DESC
          )
          SELECT
            e.id::text,
            e.station_geofence_id::text,
            g.label AS station_label,
            e.unit_id::text,
            u.unit_number,
            e.driver_id::text,
            CONCAT_WS(' ', d.first_name, d.last_name) AS driver_name,
            e.arrived_at::text,
            e.departed_at::text,
            e.dwell_minutes,
            COALESCE(f.latest_state, e.follow_up_state)::text AS follow_up_state,
            COALESCE(f.latest_user_uuid, e.follow_up_by_user_uuid::text) AS follow_up_by_user_uuid,
            COALESCE(f.latest_at::text, e.created_at::text) AS follow_up_at
          FROM compliance.dot_inspection_events e
          JOIN geo.geofences g ON g.id = e.station_geofence_id
          JOIN mdata.units u ON u.id = e.unit_id
          LEFT JOIN mdata.drivers d ON d.id = e.driver_id
          LEFT JOIN latest_followup f ON f.dot_inspection_event_id = e.id
          ${stateFilter}
          ORDER BY e.departed_at DESC
          LIMIT 500
        `,
        params
      );
      return res.rows;
    });
    return { events };
  });

  app.post("/api/v1/safety/dot-inspection-events/:id/follow-up", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    if (!["Owner", "Administrator", "Manager", "Safety"].includes(user.role)) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = followUpBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const result = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const exists = await client.query(
        `
          SELECT id::text
          FROM compliance.dot_inspection_events
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
          LIMIT 1
        `,
        [params.data.id, body.data.operating_company_id]
      );
      if (!exists.rows[0]) return null;

      const inserted = await client.query(
        `
          INSERT INTO compliance.dot_inspection_event_followups (
            operating_company_id,
            dot_inspection_event_id,
            follow_up_state,
            follow_up_by_user_uuid,
            note
          )
          VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5)
          RETURNING id::text, follow_up_state::text, created_at::text
        `,
        [body.data.operating_company_id, params.data.id, body.data.follow_up_state, user.uuid, body.data.note ?? null]
      );

      await appendCrudAudit(
        client,
        user.uuid,
        "safety.dot_inspection_event.follow_up_recorded",
        {
          dot_inspection_event_id: params.data.id,
          follow_up_state: body.data.follow_up_state,
        },
        "info",
        "CAP-13-DOT"
      );
      return inserted.rows[0] ?? null;
    });

    if (!result) return reply.code(404).send({ error: "dot_inspection_event_not_found" });
    return result;
  });
}
