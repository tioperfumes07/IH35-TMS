import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { recommendFuelStopsForRecommendation } from "../telematics/fuel-stop-planner.service.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const recommendationIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const plannerSettingsPatchSchema = z.object({
  expensive_states: z.array(z.string().trim().min(2).max(2)).min(1).max(50).optional(),
  max_off_highway_miles: z.number().positive().optional(),
  max_backwards_miles: z.number().positive().optional(),
  max_miles_per_shift: z.number().positive().optional(),
  overfill_threshold_pct: z.number().positive().max(100).optional(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: {
    query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
  }) => Promise<T>
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${operatingCompanyId}'`);
    return fn(client);
  });
}

async function hasRelation(client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<{ ok: boolean }> }> }, name: string) {
  const res = await client.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [name]);
  return Boolean(res.rows[0]?.ok);
}

export async function registerFuelPlannerRoutes(app: FastifyInstance) {
  app.get("/api/v1/fuel/planner/dashboard", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const payload = await withCompanyScope(authUser.uuid, companyId, async (client) => {
      const activeRes = await client.query<{ count: number }>(
        `
          SELECT count(*)::int AS count
          FROM views.fuel_planner_active_routes
          WHERE operating_company_id = $1
        `,
        [companyId]
      );
      const spendRes = await client.query<{ spend: number; avg_price: number }>(
        `
          SELECT
            COALESCE(sum(total_cost), 0)::numeric AS spend,
            COALESCE(avg(price_per_gallon), 0)::numeric AS avg_price
          FROM fuel.fuel_transactions
          WHERE operating_company_id = $1
            AND purchased_at >= date_trunc('month', now())
        `,
        [companyId]
      ).catch(() => ({ rows: [{ spend: 0, avg_price: 0 }] }));
      const savingsRes = await client.query<{ savings: number }>(
        `
          SELECT COALESCE(sum(savings_estimate), 0)::numeric AS savings
          FROM views.fuel_planner_active_routes
          WHERE operating_company_id = $1
        `,
        [companyId]
      );
      const complianceRes = await client.query<{ pct: number }>(
        `
          SELECT COALESCE(round(avg(pct_followed), 1), 0)::numeric AS pct
          FROM views.fuel_compliance_summary
          WHERE operating_company_id = $1
        `,
        [companyId]
      );
      const mpgRes = await client.query<{ mpg: number }>(
        `
          SELECT COALESCE(avg(current_mpg), 0)::numeric AS mpg
          FROM views.fuel_planner_active_routes
          WHERE operating_company_id = $1
        `,
        [companyId]
      );
      const lovesSyncRes = await client.query<{ synced_at: string | null }>(
        `
          SELECT max(updated_at)::text AS synced_at
          FROM fuel.loves_prices_daily
          WHERE operating_company_id = $1
        `,
        [companyId]
      ).catch(() => ({ rows: [{ synced_at: null }] }));

      return {
        active_plans: Number(activeRes.rows[0]?.count ?? 0),
        mtd_spend: Number(spendRes.rows[0]?.spend ?? 0),
        avg_price_per_gallon: Number(spendRes.rows[0]?.avg_price ?? 0),
        mtd_savings: Number(savingsRes.rows[0]?.savings ?? 0),
        compliance_pct: Number(complianceRes.rows[0]?.pct ?? 0),
        fleet_mpg: Number(mpgRes.rows[0]?.mpg ?? 0),
        loves_sync_at: lovesSyncRes.rows[0]?.synced_at ?? null,
      };
    });

    return payload;
  });

  app.get("/api/v1/fuel/planner/active-routes", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const routes = await withCompanyScope(authUser.uuid, companyId, async (client) => {
      if (!(await hasRelation(client, "views.fuel_planner_active_routes"))) return [];
      const res = await client.query(
        `
          SELECT *
          FROM views.fuel_planner_active_routes
          WHERE operating_company_id = $1
          ORDER BY computed_at DESC
          LIMIT 100
        `,
        [companyId]
      );
      return res.rows;
    });
    return { routes };
  });

  app.get("/api/v1/fuel/planner/recommendations/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const params = recommendationIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const detail = await withCompanyScope(authUser.uuid, companyId, async (client) => {
      const recRes = await client.query(
        `
          SELECT *
          FROM views.fuel_planner_active_routes
          WHERE id = $1
            AND operating_company_id = $2
          LIMIT 1
        `,
        [params.data.id, companyId]
      );
      const recommendation = recRes.rows[0] ?? null;
      if (!recommendation) return null;

      let stops: Record<string, unknown>[] = [];
      if (await hasRelation(client, "fuel.recommended_stops")) {
        const byRecommendationId = await client
          .query(
            `
              SELECT *
              FROM fuel.recommended_stops
              WHERE recommendation_id = $1
              ORDER BY mile_marker ASC NULLS LAST, sequence_number ASC NULLS LAST
            `,
            [params.data.id]
          )
          .catch(() => ({ rows: [] as Record<string, unknown>[] }));
        stops = byRecommendationId.rows;
        if (stops.length === 0) {
          const byRouteRecommendationId = await client
            .query(
              `
                SELECT *
                FROM fuel.recommended_stops
                WHERE route_recommendation_id = $1
                ORDER BY mile_marker ASC NULLS LAST, sequence_number ASC NULLS LAST
              `,
              [params.data.id]
            )
            .catch(() => ({ rows: [] as Record<string, unknown>[] }));
          stops = byRouteRecommendationId.rows;
        }
      }
      const hosAware = await recommendFuelStopsForRecommendation(client, {
        operating_company_id: companyId,
        recommendation_id: params.data.id,
      }).catch(() => []);
      return { ...recommendation, stops, hos_aware_recommendations: hosAware };
    });

    if (!detail) return reply.code(404).send({ error: "fuel_recommendation_not_found" });
    return detail;
  });

  app.post("/api/v1/fuel/planner/recommendations/:id/send-to-driver", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const params = recommendationIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const result = await withCompanyScope(authUser.uuid, companyId, async (client) => {
      const recRes = await client.query(
        `
          SELECT id, operating_company_id, driver_id, load_id, computed_at
          FROM fuel.route_recommendations
          WHERE id = $1
            AND operating_company_id = $2
          LIMIT 1
        `,
        [params.data.id, companyId]
      ).catch(() => ({ rows: [] as Record<string, unknown>[] }));
      const recommendation = recRes.rows[0] ?? null;
      if (!recommendation) return null;

      await client.query(
        `
          INSERT INTO outbox.outbox_queue (aggregate_type, aggregate_id, event_type, payload)
          VALUES ($1, $2, $3, $4::jsonb)
        `,
        [
          "fuel.route_recommendations",
          params.data.id,
          "fuel.recommendation_sent_to_driver",
          JSON.stringify({
            recommendation_id: params.data.id,
            operating_company_id: companyId,
            driver_id: recommendation.driver_id,
            load_id: recommendation.load_id,
          }),
        ]
      );

      await appendCrudAudit(
        client,
        authUser.uuid,
        "fuel.recommendation_sent_to_driver",
        {
          resource_type: "fuel.route_recommendations",
          resource_id: params.data.id,
          entity_type: "fuel_recommendation",
          entity_id: params.data.id,
          operating_company_id: companyId,
        },
        "info",
        "BT-3-FUEL-PLANNER-REBUILD"
      );

      return {
        ok: true,
        recommendation_id: params.data.id,
        sent_at: new Date().toISOString(),
      };
    });

    if (!result) return reply.code(404).send({ error: "fuel_recommendation_not_found" });
    return result;
  });

  app.get("/api/v1/fuel/planner/compliance/summary", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const summary = await withCompanyScope(authUser.uuid, companyId, async (client) => {
      const fleetRes = await client.query<{ pct: number; total_recs: number }>(
        `
          SELECT
            COALESCE(round(avg(pct_followed), 1), 0)::numeric AS pct,
            COALESCE(sum(total_recs), 0)::bigint AS total_recs
          FROM views.fuel_compliance_summary
          WHERE operating_company_id = $1
        `,
        [companyId]
      );
      const perDriverRes = await client.query(
        `
          SELECT
            c.driver_id,
            CONCAT_WS(' ', d.first_name, d.last_name) AS driver_name,
            c.matched_count,
            c.total_recs,
            c.pct_followed
          FROM views.fuel_compliance_summary c
          LEFT JOIN mdata.drivers d ON d.id = c.driver_id
          WHERE c.operating_company_id = $1
          ORDER BY c.pct_followed DESC NULLS LAST
          LIMIT 25
        `,
        [companyId]
      );
      return {
        fleet_pct_followed: Number(fleetRes.rows[0]?.pct ?? 0),
        fleet_total_recommendations: Number(fleetRes.rows[0]?.total_recs ?? 0),
        per_driver: perDriverRes.rows,
      };
    });
    return summary;
  });

  app.get("/api/v1/fuel/planner/savings/summary", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const summary = await withCompanyScope(authUser.uuid, companyId, async (client) => {
      const fleetRes = await client.query<{ savings_ytd: number; lost_savings_ytd: number }>(
        `
          SELECT
            COALESCE(sum(savings_ytd), 0)::numeric AS savings_ytd,
            COALESCE(sum(lost_savings_ytd), 0)::numeric AS lost_savings_ytd
          FROM views.fuel_savings_summary
          WHERE operating_company_id = $1
        `,
        [companyId]
      );
      const topRes = await client.query(
        `
          SELECT
            s.driver_id,
            CONCAT_WS(' ', d.first_name, d.last_name) AS driver_name,
            s.savings_ytd
          FROM views.fuel_savings_summary s
          LEFT JOIN mdata.drivers d ON d.id = s.driver_id
          WHERE s.operating_company_id = $1
          ORDER BY s.savings_ytd DESC NULLS LAST
          LIMIT 1
        `,
        [companyId]
      );
      return {
        fleet_savings_ytd: Number(fleetRes.rows[0]?.savings_ytd ?? 0),
        fleet_lost_savings_ytd: Number(fleetRes.rows[0]?.lost_savings_ytd ?? 0),
        top_driver: topRes.rows[0] ?? null,
      };
    });
    return summary;
  });

  app.get("/api/v1/fuel/planner/settings", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const settings = await withCompanyScope(authUser.uuid, companyId, async (client) => {
      const res = await client.query(
        `
          INSERT INTO fuel.fuel_planner_settings (operating_company_id)
          VALUES ($1)
          ON CONFLICT (operating_company_id) DO UPDATE
            SET operating_company_id = EXCLUDED.operating_company_id
          RETURNING *
        `,
        [companyId]
      );
      return res.rows[0];
    });
    return settings;
  });

  app.patch("/api/v1/fuel/planner/settings", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = plannerSettingsPatchSchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const companyId = query.data.operating_company_id;

    const keys = Object.keys(body.data);
    if (keys.length === 0) return reply.code(400).send({ error: "empty_patch" });

    const updated = await withCompanyScope(authUser.uuid, companyId, async (client) => {
      await client.query(
        `
          INSERT INTO fuel.fuel_planner_settings (operating_company_id)
          VALUES ($1)
          ON CONFLICT (operating_company_id) DO NOTHING
        `,
        [companyId]
      );

      const setClauses: string[] = [];
      const values: unknown[] = [companyId];
      if (body.data.expensive_states) {
        values.push(body.data.expensive_states);
        setClauses.push(`expensive_states = $${values.length}::text[]`);
      }
      if (body.data.max_off_highway_miles !== undefined) {
        values.push(body.data.max_off_highway_miles);
        setClauses.push(`max_off_highway_miles = $${values.length}`);
      }
      if (body.data.max_backwards_miles !== undefined) {
        values.push(body.data.max_backwards_miles);
        setClauses.push(`max_backwards_miles = $${values.length}`);
      }
      if (body.data.max_miles_per_shift !== undefined) {
        values.push(body.data.max_miles_per_shift);
        setClauses.push(`max_miles_per_shift = $${values.length}`);
      }
      if (body.data.overfill_threshold_pct !== undefined) {
        values.push(body.data.overfill_threshold_pct);
        setClauses.push(`overfill_threshold_pct = $${values.length}`);
      }
      values.push(authUser.uuid);
      setClauses.push(`updated_by_user_id = $${values.length}`);
      setClauses.push(`updated_at = now()`);

      const updateRes = await client.query(
        `
          UPDATE fuel.fuel_planner_settings
          SET ${setClauses.join(", ")}
          WHERE operating_company_id = $1
          RETURNING *
        `,
        values
      );

      await appendCrudAudit(
        client,
        authUser.uuid,
        "fuel.planner_settings_updated",
        {
          resource_type: "fuel.fuel_planner_settings",
          resource_id: companyId,
          operating_company_id: companyId,
          patch: body.data,
        },
        "info",
        "BT-3-FUEL-PLANNER-REBUILD"
      );

      return updateRes.rows[0];
    });

    return updated;
  });
}
