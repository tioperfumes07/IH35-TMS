import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const listQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  filter: z.enum(["active", "acknowledged", "all"]).default("all"),
  page_size: z.coerce.number().int().min(1).max(300).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

const acknowledgeBodySchema = z.object({
  operating_company_id: z.string().uuid(),
});

type QueryClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

function currentUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withCompanyScope<T>(userId: string, operatingCompanyId: string, source: string, fn: (client: QueryClient) => Promise<T>) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    assertTenantContext(operatingCompanyId, source);
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    return fn(client as QueryClient);
  });
}

export async function registerGeofenceBreachRoutes(app: FastifyInstance) {
  app.get("/api/v1/safety/geofence-breaches", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const from = query.data.from ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const to = query.data.to ?? new Date().toISOString();

    const events = await withCompanyScope(
      user.uuid,
      query.data.operating_company_id,
      "safety.geofence_breach_routes_list",
      async (client) => {
        const params: unknown[] = [query.data.operating_company_id, from, to];
        let ackFilter = "";
        if (query.data.filter === "active") {
          ackFilter = "AND e.acknowledged_at IS NULL";
        } else if (query.data.filter === "acknowledged") {
          ackFilter = "AND e.acknowledged_at IS NOT NULL";
        }

        const summary = await client.query<{
          total_count: string | number;
          active_count: string | number;
          active_vehicle_ids: string[] | null;
        }>(
          `
            SELECT
              COUNT(*) FILTER (
                WHERE ($4::text = 'all')
                   OR ($4::text = 'active' AND acknowledged_at IS NULL)
                   OR ($4::text = 'acknowledged' AND acknowledged_at IS NOT NULL)
              )::int AS total_count,
              COUNT(*) FILTER (WHERE acknowledged_at IS NULL)::int AS active_count,
              COALESCE(array_agg(DISTINCT vehicle_id::text) FILTER (WHERE acknowledged_at IS NULL), ARRAY[]::text[]) AS active_vehicle_ids
            FROM safety.geofence_breach_events
            WHERE operating_company_id = $1::uuid
              AND event_at >= $2::timestamptz
              AND event_at <= $3::timestamptz
          `,
          [...params, query.data.filter]
        );
        const res = await client.query(
          `
            SELECT
              e.id::text,
              e.operating_company_id::text,
              e.vehicle_id::text,
              u.unit_number,
              e.geofence_id::text,
              g.label AS geofence_label,
              e.customer_id::text,
              c.customer_name,
              e.event_type::text,
              e.event_at::text,
              e.position_lat,
              e.position_lng,
              e.acknowledged_at::text,
              e.acknowledged_by::text,
              e.created_at::text
            FROM safety.geofence_breach_events e
            LEFT JOIN mdata.units u ON u.id = e.vehicle_id
                                    AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $1::uuid
            LEFT JOIN geo.geofences g ON g.id = e.geofence_id
            LEFT JOIN mdata.customers c ON c.id = e.customer_id
                                        AND c.operating_company_id = $1::uuid
            WHERE e.operating_company_id = $1::uuid
              AND e.event_at >= $2::timestamptz
              AND e.event_at <= $3::timestamptz
              ${ackFilter}
            ORDER BY e.event_at DESC
            LIMIT $4::int OFFSET $5::int
          `,
          [...params, query.data.page_size, query.data.offset]
        );
        const metadata = summary.rows[0];
        return {
          events: res.rows,
          total_count: Number(metadata?.total_count ?? 0),
          active_count: Number(metadata?.active_count ?? 0),
          active_vehicle_ids: metadata?.active_vehicle_ids ?? [],
        };
      }
    );

    return { ...events, from, to, filter: query.data.filter, page_size: query.data.page_size, offset: query.data.offset };
  });

  app.post("/api/v1/safety/geofence-breaches/:id/acknowledge", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = acknowledgeBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const event = await withCompanyScope(
      user.uuid,
      body.data.operating_company_id,
      "safety.geofence_breach_routes_acknowledge",
      async (client) => {
        const res = await client.query(
          `
            UPDATE safety.geofence_breach_events
            SET
              acknowledged_at = COALESCE(acknowledged_at, now()),
              acknowledged_by = COALESCE(acknowledged_by, $3::uuid)
            WHERE id = $1::uuid
              AND operating_company_id = $2::uuid
            RETURNING
              id::text,
              operating_company_id::text,
              vehicle_id::text,
              geofence_id::text,
              customer_id::text,
              event_type::text,
              event_at::text,
              position_lat,
              position_lng,
              acknowledged_at::text,
              acknowledged_by::text,
              created_at::text
          `,
          [params.data.id, body.data.operating_company_id, user.uuid]
        );
        return res.rows[0] ?? null;
      }
    );

    if (!event) return reply.code(404).send({ error: "geofence_breach_not_found" });
    return event;
  });
}
