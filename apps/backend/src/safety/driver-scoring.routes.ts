import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { computeDriverScoreFromCounts } from "./driver-scoring.service.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const listQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  period_days: z.coerce.number().int().min(1).max(365).default(30),
});

const eventListQuerySchema = listQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const detailParamsSchema = z.object({
  driver_id: z.string().uuid(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: any) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await assertCompanyMembership(client, userId, companyId);
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    return fn(client);
  });
}

export async function registerDriverScoringRoutes(app: FastifyInstance) {
  app.get("/api/v1/safety/driver-scoring", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const q = parsed.data;
    const rows = await withCompany(user.uuid, q.operating_company_id, async (client) => {
      const res = await client.query(
        `
          WITH current_window AS (
            SELECT
              e.driver_id,
              COUNT(*)::int AS incidents,
              COUNT(*) FILTER (WHERE e.severity = 'critical')::int AS critical_count,
              COUNT(*) FILTER (WHERE e.severity = 'major')::int AS major_count,
              COUNT(*) FILTER (WHERE e.severity = 'minor')::int AS minor_count
            FROM safety.harsh_events e
            JOIN mdata.drivers event_driver
              ON event_driver.id = e.driver_id
             AND (
               event_driver.operating_company_id = e.operating_company_id
               OR EXISTS (
                 SELECT 1 FROM mdata.driver_company_authorizations event_dca
                  WHERE event_dca.driver_id = event_driver.id
                    AND event_dca.company_id = e.operating_company_id
                    AND event_dca.is_authorized = true
                    AND event_dca.deactivated_at IS NULL
               )
             )
            WHERE e.operating_company_id = $1::uuid
              AND e.driver_id IS NOT NULL
              AND e.event_at >= (now() - make_interval(days => $2::int))
              AND e.event_at < now()
            GROUP BY e.driver_id
          ),
          prior_window AS (
            SELECT
              e.driver_id,
              COUNT(*) FILTER (WHERE e.severity = 'critical')::int AS prior_critical_count,
              COUNT(*) FILTER (WHERE e.severity = 'major')::int AS prior_major_count,
              COUNT(*) FILTER (WHERE e.severity = 'minor')::int AS prior_minor_count
            FROM safety.harsh_events e
            JOIN mdata.drivers event_driver
              ON event_driver.id = e.driver_id
             AND (
               event_driver.operating_company_id = e.operating_company_id
               OR EXISTS (
                 SELECT 1 FROM mdata.driver_company_authorizations event_dca
                  WHERE event_dca.driver_id = event_driver.id
                    AND event_dca.company_id = e.operating_company_id
                    AND event_dca.is_authorized = true
                    AND event_dca.deactivated_at IS NULL
               )
             )
            WHERE e.operating_company_id = $1::uuid
              AND e.driver_id IS NOT NULL
              AND e.event_at >= (now() - make_interval(days => ($2::int * 2)))
              AND e.event_at < (now() - make_interval(days => $2::int))
            GROUP BY e.driver_id
          )
          SELECT
            d.id::text AS driver_id,
            BTRIM(CONCAT_WS(' ', d.first_name, d.last_name)) AS driver_name,
            COALESCE(c.incidents, 0)::int AS incidents,
            COALESCE(c.critical_count, 0)::int AS critical_count,
            COALESCE(c.major_count, 0)::int AS major_count,
            COALESCE(c.minor_count, 0)::int AS minor_count,
            COALESCE(p.prior_critical_count, 0)::int AS prior_critical_count,
            COALESCE(p.prior_major_count, 0)::int AS prior_major_count,
            COALESCE(p.prior_minor_count, 0)::int AS prior_minor_count
          FROM mdata.drivers d
          LEFT JOIN current_window c ON c.driver_id = d.id
          LEFT JOIN prior_window p ON p.driver_id = d.id
          WHERE (
              d.operating_company_id = $1::uuid
              OR EXISTS (
                SELECT 1 FROM mdata.driver_company_authorizations roster_dca
                 WHERE roster_dca.driver_id = d.id
                   AND roster_dca.company_id = $1::uuid
                   AND roster_dca.is_authorized = true
                   AND roster_dca.deactivated_at IS NULL
              )
            )
            AND d.status = 'Active'::mdata.driver_status
            AND d.deactivated_at IS NULL
            AND d.archived_at IS NULL
          ORDER BY incidents DESC, driver_name ASC
          LIMIT 500
        `,
        [q.operating_company_id, q.period_days]
      );
      return res.rows as Array<Record<string, unknown>>;
    });

    const scored = rows.map((row) => {
      const current = computeDriverScoreFromCounts({
        counts: {
          critical: Number(row.critical_count ?? 0),
          major: Number(row.major_count ?? 0),
          minor: Number(row.minor_count ?? 0),
        },
        periodMiles: null,
      });
      const previous = computeDriverScoreFromCounts({
        counts: {
          critical: Number(row.prior_critical_count ?? 0),
          major: Number(row.prior_major_count ?? 0),
          minor: Number(row.prior_minor_count ?? 0),
        },
        periodMiles: null,
      });
      return {
        driver_id: row.driver_id,
        driver_name: row.driver_name ?? "Unknown Driver",
        incidents: Number(row.incidents ?? 0),
        counts_by_kind: {
          critical: Number(row.critical_count ?? 0),
          major: Number(row.major_count ?? 0),
          minor: Number(row.minor_count ?? 0),
        },
        score: current.score,
        trend_vs_prior: current.score - previous.score,
        period_miles: current.period_miles,
        score_per_1k_miles: current.score_per_1k_miles,
      };
    });

    return { rows: scored };
  });

  app.get("/api/v1/safety/driver-scoring/:driver_id/events", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = eventListQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const params = detailParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);

    const result = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const parent = await client.query(
        `SELECT 1 FROM mdata.drivers d
          WHERE d.id = $1::uuid
            AND d.archived_at IS NULL
            AND (
              d.operating_company_id = $2::uuid
              OR EXISTS (
                SELECT 1 FROM mdata.driver_company_authorizations dca
                 WHERE dca.driver_id = d.id
                   AND dca.company_id = $2::uuid
                   AND dca.is_authorized = true
                   AND dca.deactivated_at IS NULL
              )
            )
          LIMIT 1`,
        [params.data.driver_id, query.data.operating_company_id]
      );
      if (!parent.rows[0]) return { found: false, events: [], totalCount: 0 };
      const count = await client.query(
        `SELECT COUNT(*)::int AS total_count
           FROM safety.harsh_events e
          WHERE e.operating_company_id = $1::uuid
            AND e.driver_id = $2::uuid
            AND e.event_at >= (now() - make_interval(days => $3::int))
            AND e.event_at < now()`,
        [query.data.operating_company_id, params.data.driver_id, query.data.period_days]
      );
      const res = await client.query(
        `
          SELECT
            e.id::text,
            e.driver_id::text,
            e.unit_id::text,
            u.unit_number,
            e.event_at::text,
            e.event_kind,
            e.severity,
            e.speed_at_event_mph,
            e.g_force,
            e.latitude,
            e.longitude
          FROM safety.harsh_events e
          JOIN mdata.drivers d
            ON d.id = e.driver_id
           AND (
             d.operating_company_id = e.operating_company_id
             OR EXISTS (
               SELECT 1 FROM mdata.driver_company_authorizations label_dca
                WHERE label_dca.driver_id = d.id
                  AND label_dca.company_id = e.operating_company_id
                  AND label_dca.is_authorized = true
                  AND label_dca.deactivated_at IS NULL
             )
           )
          LEFT JOIN mdata.units u ON u.id = e.unit_id
                                  AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $1::uuid
          WHERE e.operating_company_id = $1::uuid
            AND e.driver_id = $2::uuid
            AND e.event_at >= (now() - make_interval(days => $3::int))
            AND e.event_at < now()
          ORDER BY e.event_at DESC
          LIMIT $4
          OFFSET $5
        `,
        [query.data.operating_company_id, params.data.driver_id, query.data.period_days, query.data.limit, query.data.offset]
      );
      return { found: true, events: res.rows, totalCount: Number(count.rows[0]?.total_count ?? 0) };
    });
    if (!result.found) return reply.code(404).send({ error: "mdata_driver_not_found" });
    return { events: result.events, total_count: result.totalCount };
  });
}
