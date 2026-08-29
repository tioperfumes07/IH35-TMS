import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { requireAuth } from "../auth/session-middleware.js";
import { recommendFuelStopsForRecommendation } from "../telematics/fuel-stop-planner.service.js";
import { enqueueOutboxEvent } from "../outbox/enqueue-outbox-event.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const activeRoutesQuerySchema = companyQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

const complianceSummaryQuerySchema = companyQuerySchema.extend({
  driver_id: z.string().uuid().optional(),
});

const recommendationIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const plannerSettingsPatchSchema = z.object({
  expensive_states: z.array(z.string().trim().min(2).max(2)).max(50).optional(),
  max_off_highway_miles: z.number().positive().optional(),
  max_backwards_miles: z.number().positive().optional(),
  max_miles_per_shift: z.number().positive().optional(),
  overfill_threshold_pct: z.number().positive().max(100).optional(),
});

class FuelPlannerSettingsWriteError extends Error {
  constructor() {
    super("fuel_planner_settings_write_failed");
    this.name = "FuelPlannerSettingsWriteError";
  }
}

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
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);
    return fn(client);
  });
}

async function hasRelation(client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<{ ok: boolean }> }> }, name: string) {
  const res = await client.query(`SELECT to_regclass($1::text) IS NOT NULL AS ok`, [name]);
  return Boolean(res.rows[0]?.ok);
}

async function hasColumn(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<{ ok: boolean }> }> },
  schema: string,
  table: string,
  column: string
) {
  const res = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2 AND column_name = $3
     ) AS ok`,
    [schema, table, column]
  );
  return Boolean(res.rows[0]?.ok);
}

export async function registerFuelPlannerRoutes(app: FastifyInstance) {
  app.get("/api/v1/fuel/planner/dashboard", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const payload = await withCompanyScope(authUser.uuid, companyId, async (client) => {
      const plannerSourceAvailable = await hasRelation(client, "fuel.route_recommendations");
      const complianceSourceAvailable = await hasRelation(client, "fuel.relay_matches");
      const activeRes = await client.query<{ count: number }>(
        `
          SELECT count(*)::int AS count
          FROM views.fuel_planner_active_routes
          WHERE operating_company_id = $1::uuid
        `,
        [companyId]
      );
      const spendRes = await client.query<{ spend: number; avg_price: number }>(
        `
          SELECT
            COALESCE(sum(total_cost), 0)::numeric AS spend,
            COALESCE(avg(price_per_gallon), 0)::numeric AS avg_price
          FROM fuel.fuel_transactions
          WHERE operating_company_id = $1::uuid
            AND purchased_at >= date_trunc('month', now())
        `,
        [companyId]
      );
      // FUEL-PLANNER-DASHBOARD-SPEND-QUERY-FAILS-AS-ZERO: a failed spend query must not become
      // authoritative $0 / $0. Genuine empty month is COALESCE(sum)=0 from a successful query.
      const savingsRes = await client.query<{ savings: number }>(
        `
          SELECT COALESCE(sum(savings_estimate), 0)::numeric AS savings
          FROM views.fuel_planner_active_routes
          WHERE operating_company_id = $1::uuid
        `,
        [companyId]
      );
      const complianceRes = await client.query<{ pct: number }>(
        `
          SELECT COALESCE(round(avg(pct_followed), 1), 0)::numeric AS pct
          FROM views.fuel_compliance_summary
          WHERE operating_company_id = $1::uuid
        `,
        [companyId]
      );
      const mpgRes = await client.query<{ mpg: number }>(
        `
          SELECT COALESCE(avg(current_mpg), 0)::numeric AS mpg
          FROM views.fuel_planner_active_routes
          WHERE operating_company_id = $1::uuid
        `,
        [companyId]
      );
      // LIAB-F9927-SILENT-CATCH-SWEEP (fuel leg): fuel.loves_prices_daily is foundational (confirmed
      // live, to_regclass non-null) — unlike fuel.recommended_stops/views.fuel_planner_active_routes
      // above, which genuinely ARE conditional and correctly gate on hasRelation() first, this table
      // has no such gate and was queried directly. MAX(updated_at) on an existing-but-empty table
      // already returns NULL with no error, so the .catch() only ever fired on a real query failure —
      // it never legitimately distinguished "never synced" (which needs no catch) from "query broke".
      const lovesSyncRes = await client.query<{ synced_at: string | null }>(
        `
          SELECT max(updated_at)::text AS synced_at
          FROM fuel.loves_prices_daily
          WHERE operating_company_id = $1::uuid
        `,
        [companyId]
      );

      return {
        planner_source_available: plannerSourceAvailable,
        compliance_source_available: complianceSourceAvailable,
        active_plans: plannerSourceAvailable ? Number(activeRes.rows[0]?.count ?? 0) : null,
        mtd_spend: Number(spendRes.rows[0]?.spend ?? 0),
        avg_price_per_gallon: Number(spendRes.rows[0]?.avg_price ?? 0),
        mtd_savings: plannerSourceAvailable ? Number(savingsRes.rows[0]?.savings ?? 0) : null,
        compliance_pct: complianceSourceAvailable ? Number(complianceRes.rows[0]?.pct ?? 0) : null,
        fleet_mpg: plannerSourceAvailable ? Number(mpgRes.rows[0]?.mpg ?? 0) : null,
        loves_sync_at: lovesSyncRes.rows[0]?.synced_at ?? null,
      };
    });

    return payload;
  });

  app.get("/api/v1/fuel/planner/active-routes", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    const query = activeRoutesQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const { operating_company_id: companyId, limit, offset } = query.data;

    const result = await withCompanyScope(authUser.uuid, companyId, async (client) => {
      const sourceAvailable = await hasRelation(client, "fuel.route_recommendations");
      if (!sourceAvailable || !(await hasRelation(client, "views.fuel_planner_active_routes"))) {
        return { routes: [], total_count: null, source_available: false };
      }
      const countRes = await client.query<{ total_count: number }>(
        `SELECT count(*)::int AS total_count FROM views.fuel_planner_active_routes WHERE operating_company_id = $1::uuid`,
        [companyId]
      );
      const res = await client.query(
        `
          SELECT *
          FROM views.fuel_planner_active_routes
          WHERE operating_company_id = $1::uuid
          ORDER BY computed_at DESC, id DESC
          LIMIT $2 OFFSET $3
        `,
        [companyId, limit, offset]
      );
      return { routes: res.rows, total_count: Number(countRes.rows[0]?.total_count ?? 0), source_available: true };
    });
    return { ...result, limit, offset };
  });

  app.get("/api/v1/fuel/planner/recommendations/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    const params = recommendationIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const detail = await withCompanyScope(authUser.uuid, companyId, async (client) => {
      // FUEL-F7341: the detail reader is independently addressable from a stale URL/query
      // cache. Production can intentionally omit both the planner source table and its
      // active-routes view, so do not let that direct read turn an unavailable source into 500.
      if (
        !(await hasRelation(client, "fuel.route_recommendations")) ||
        !(await hasRelation(client, "views.fuel_planner_active_routes"))
      ) {
        return { unavailable: true as const };
      }
      const recRes = await client.query(
        `
          SELECT *
          FROM views.fuel_planner_active_routes
          WHERE id = $1
            AND operating_company_id = $2::uuid
          LIMIT 1
        `,
        [params.data.id, companyId]
      );
      const recommendation = recRes.rows[0] ?? null;
      if (!recommendation) return null;

      let stops: Record<string, unknown>[] = [];
      if (await hasRelation(client, "fuel.recommended_stops")) {
        const recommendationColumn = (await hasColumn(client, "fuel", "recommended_stops", "recommendation_id"))
          ? "recommendation_id"
          : (await hasColumn(client, "fuel", "recommended_stops", "route_recommendation_id"))
            ? "route_recommendation_id"
            : null;
        if (recommendationColumn) {
          const stopResult = await client.query(
            `
              SELECT *
              FROM fuel.recommended_stops
              WHERE ${recommendationColumn} = $1
              ORDER BY mile_marker ASC NULLS LAST, sequence_number ASC NULLS LAST
            `,
            [params.data.id]
          );
          stops = stopResult.rows;
        }
      }
      const hosAware = await recommendFuelStopsForRecommendation(client, {
        operating_company_id: companyId,
        recommendation_id: params.data.id,
      });
      return { ...recommendation, stops, hos_aware_recommendations: hosAware };
    });

    if (detail && "unavailable" in detail) {
      return reply.code(503).send({ error: "fuel_planner_source_unavailable" });
    }
    if (!detail) return reply.code(404).send({ error: "fuel_recommendation_not_found" });
    return detail;
  });

  app.post("/api/v1/fuel/planner/recommendations/:id/send-to-driver", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    const params = recommendationIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const result = await withCompanyScope(authUser.uuid, companyId, async (client) => {
      // FUEL-F7338: production can intentionally run without the planner source relation.
      // Read surfaces already disclose that state; a stale/direct Send request must do the
      // same instead of querying a missing table and turning source unavailability into HTTP 500.
      if (!(await hasRelation(client, "fuel.route_recommendations"))) {
        return { unavailable: true as const };
      }
      const recRes = await client.query(
        `
          SELECT id, operating_company_id, driver_id, load_id, computed_at
          FROM fuel.route_recommendations
          WHERE id = $1
            AND operating_company_id = $2::uuid
          LIMIT 1
        `,
        [params.data.id, companyId]
      );
      const recommendation = recRes.rows[0] ?? null;
      if (!recommendation) return null;

      const enqueueResult = await enqueueOutboxEvent(
        client,
        "fuel.recommendation_sent_to_driver",
        { aggregate_type: "fuel.route_recommendations", aggregate_id: params.data.id },
        {
          recommendation_id: params.data.id,
          operating_company_id: companyId,
          driver_id: recommendation.driver_id,
          load_id: recommendation.load_id,
        },
        `fuel:recommendation:${companyId}:${params.data.id}:driver-notice`
      );

      if (enqueueResult.enqueued) {
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
      }

      return {
        ok: true,
        recommendation_id: params.data.id,
        delivery_status: enqueueResult.enqueued ? ("queued" as const) : ("already_queued" as const),
        queued_at: enqueueResult.enqueued ? new Date().toISOString() : null,
      };
    });

    if (result && "unavailable" in result) {
      return reply.code(503).send({ error: "fuel_planner_source_unavailable" });
    }
    if (!result) return reply.code(404).send({ error: "fuel_recommendation_not_found" });
    return result;
  });

  app.get("/api/v1/fuel/planner/compliance/summary", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    const query = complianceSummaryQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;
    const driverId = query.data.driver_id ?? null;

    const summary = await withCompanyScope(authUser.uuid, companyId, async (client) => {
      const sourceAvailable = await hasRelation(client, "fuel.relay_matches");
      const fleetRes = await client.query<{ pct: number; total_recs: number }>(
        `
          SELECT
            COALESCE(round(avg(pct_followed), 1), 0)::numeric AS pct,
            COALESCE(sum(total_recs), 0)::bigint AS total_recs
          FROM views.fuel_compliance_summary
          WHERE operating_company_id = $1::uuid
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
                                    AND d.operating_company_id = $1::uuid
          WHERE c.operating_company_id = $1::uuid
            AND ($2::uuid IS NULL OR c.driver_id = $2::uuid)
          ORDER BY c.pct_followed DESC NULLS LAST
        `,
        [companyId, driverId]
      );
      return {
        source_available: sourceAvailable,
        fleet_pct_followed: sourceAvailable ? Number(fleetRes.rows[0]?.pct ?? 0) : null,
        fleet_total_recommendations: sourceAvailable ? Number(fleetRes.rows[0]?.total_recs ?? 0) : null,
        per_driver: perDriverRes.rows,
      };
    });
    return summary;
  });

  app.get("/api/v1/fuel/planner/savings/summary", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const summary = await withCompanyScope(authUser.uuid, companyId, async (client) => {
      const sourceAvailable = await hasRelation(client, "fuel.relay_matches");
      const fleetRes = await client.query<{ savings_ytd: number; lost_savings_ytd: number }>(
        `
          SELECT
            COALESCE(sum(savings_ytd), 0)::numeric AS savings_ytd,
            COALESCE(sum(lost_savings_ytd), 0)::numeric AS lost_savings_ytd
          FROM views.fuel_savings_summary
          WHERE operating_company_id = $1::uuid
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
                                    AND d.operating_company_id = $1::uuid
          WHERE s.operating_company_id = $1::uuid
          ORDER BY s.savings_ytd DESC NULLS LAST
          LIMIT 1
        `,
        [companyId]
      );
      return {
        source_available: sourceAvailable,
        fleet_savings_ytd: sourceAvailable ? Number(fleetRes.rows[0]?.savings_ytd ?? 0) : null,
        fleet_lost_savings_ytd: sourceAvailable ? Number(fleetRes.rows[0]?.lost_savings_ytd ?? 0) : null,
        top_driver: sourceAvailable ? topRes.rows[0] ?? null : null,
      };
    });
    return summary;
  });

  app.get("/api/v1/fuel/planner/settings", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const settings = await withCompanyScope(authUser.uuid, companyId, async (client) => {
      const res = await client.query(
        `
          SELECT operating_company_id,
                 expensive_states,
                 max_off_highway_miles,
                 max_backwards_miles,
                 max_miles_per_shift,
                 overfill_threshold_pct,
                 updated_at,
                 updated_by_user_id
          FROM fuel.fuel_planner_settings
          WHERE operating_company_id = $1::uuid
          LIMIT 1
        `,
        [companyId]
      );
      return res.rows[0] ?? {
        operating_company_id: companyId,
        expensive_states: ["NY", "PA", "NJ", "CA", "IL", "OR", "WA", "HI"],
        max_off_highway_miles: 5,
        max_backwards_miles: 5,
        max_miles_per_shift: 720,
        overfill_threshold_pct: 95,
        updated_at: null,
        updated_by_user_id: null,
      };
    });
    return settings;
  });

  app.patch("/api/v1/fuel/planner/settings", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = plannerSettingsPatchSchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const companyId = query.data.operating_company_id;

    const keys = Object.keys(body.data);
    if (keys.length === 0) return reply.code(400).send({ error: "empty_patch" });

    try {
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
      if (body.data.expensive_states !== undefined) {
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
          WHERE operating_company_id = $1::uuid
          RETURNING *
        `,
        values
      );
      const updatedRow = updateRes.rows[0];
      if (!updatedRow) throw new FuelPlannerSettingsWriteError();

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

      return updatedRow;
    });

    return updated;
    } catch (error) {
      if (error instanceof FuelPlannerSettingsWriteError) {
        return reply.code(409).send({ error: error.message });
      }
      throw error;
    }
  });
}
