import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { computeDriverFuelScorecard } from "./fuel-driver-scorecard.service.js";
import { computeDriverDamageScorecard } from "./driver-damage-scorecard.service.js";
import { computeDriverFuelIntegrity } from "./fuel-integrity.service.js";
import { listIntegrityFindingsAttribution } from "./integrity-findings-attribution.service.js";
import { computeDamageEventAttribution } from "./damage-event-attribution.service.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
const idSchema = z.object({ unit_id: z.string().uuid().optional(), driver_id: z.string().uuid().optional(), vendor_id: z.string().uuid().optional() });

// B-30 — driver-scorecard / fuel-anomalies default to a trailing 30-day period when not given
// explicitly, matching B-28's own "30+ days" MPG-flag requirement (a shorter window makes the
// fleet-mean/SD comparison too noisy to mean anything).
const periodQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  period_start: z.string().datetime({ offset: true }).optional(),
  period_end: z.string().datetime({ offset: true }).optional(),
});

function resolvePeriod(data: { period_start?: string; period_end?: string }): { periodStart: string; periodEnd: string } {
  const periodEnd = data.period_end ?? new Date().toISOString();
  const periodStart = data.period_start ?? new Date(new Date(periodEnd).getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  return { periodStart, periodEnd };
}

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: any) => Promise<T>) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    return fn(client);
  });
}

export async function registerMaintenanceIntegrityRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/integrity/unit-history", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const rows = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `SELECT * FROM views.maintenance_unit_history WHERE operating_company_id = $1::uuid ORDER BY cost_90d DESC NULLS LAST LIMIT $2`,
        [query.data.operating_company_id, query.data.limit]
      );
      return res.rows;
    });
    return { rows };
  });

  app.get("/api/v1/maintenance/integrity/unit-history/:unit_id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idSchema.safeParse(req.params ?? {});
    if (!params.success || !params.data.unit_id) return reply.code(400).send({ error: "validation_error" });
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const row = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `SELECT * FROM views.maintenance_unit_history WHERE operating_company_id = $1::uuid AND unit_id = $2 LIMIT 1`,
        [query.data.operating_company_id, params.data.unit_id]
      );
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "not_found" });
    return row;
  });

  app.get("/api/v1/maintenance/integrity/driver-history", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const rows = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `SELECT * FROM views.maintenance_driver_history WHERE operating_company_id = $1::uuid ORDER BY accidents_90d DESC, wo_count_90d DESC LIMIT $2`,
        [query.data.operating_company_id, query.data.limit]
      );
      return res.rows;
    });
    return { rows };
  });

  app.get("/api/v1/maintenance/integrity/driver-history/:driver_id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idSchema.safeParse(req.params ?? {});
    if (!params.success || !params.data.driver_id) return reply.code(400).send({ error: "validation_error" });
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const row = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `SELECT * FROM views.maintenance_driver_history WHERE operating_company_id = $1::uuid AND driver_id = $2 LIMIT 1`,
        [query.data.operating_company_id, params.data.driver_id]
      );
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "not_found" });
    return row;
  });

  app.get("/api/v1/maintenance/integrity/vendor-history", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const rows = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `SELECT * FROM views.maintenance_vendor_history WHERE operating_company_id = $1::uuid ORDER BY spend_90d DESC NULLS LAST LIMIT $2`,
        [query.data.operating_company_id, query.data.limit]
      );
      return res.rows;
    });
    return { rows };
  });

  app.get("/api/v1/maintenance/integrity/vendor-history/:vendor_id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idSchema.safeParse(req.params ?? {});
    if (!params.success || !params.data.vendor_id) return reply.code(400).send({ error: "validation_error" });
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const row = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `SELECT * FROM views.maintenance_vendor_history WHERE operating_company_id = $1::uuid AND vendor_id = $2 LIMIT 1`,
        [query.data.operating_company_id, params.data.vendor_id]
      );
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "not_found" });
    return row;
  });

  app.get("/api/v1/maintenance/integrity/fleet-baselines", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const rows = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `SELECT * FROM views.maintenance_fleet_baselines WHERE operating_company_id = $1::uuid ORDER BY equipment_class ASC`,
        [query.data.operating_company_id]
      );
      return res.rows;
    });
    return { rows };
  });

  // B-30 — one driver scorecard combining B-28 (fuel/MPG) and B-29 (damage/tire/accident),
  // both attributed by driverAtTimeSql (B-27), never mdata.units.assigned_driver_id.
  app.get("/api/v1/maintenance/integrity/driver-scorecard", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = periodQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const { periodStart, periodEnd } = resolvePeriod(query.data);
    const rows = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const fuel = await computeDriverFuelScorecard(client, query.data.operating_company_id, periodStart, periodEnd);
      const damage = await computeDriverDamageScorecard(client, query.data.operating_company_id, periodStart, periodEnd);
      const fuelByDriver = new Map(fuel.map((r) => [r.driver_id, r]));
      const damageByDriver = new Map(damage.map((r) => [r.driver_id, r]));
      const driverIds = new Set<string>([...fuelByDriver.keys(), ...damageByDriver.keys()]);
      return [...driverIds].sort().map((driverId) => ({
        driver_id: driverId,
        period_start: periodStart,
        period_end: periodEnd,
        fuel: fuelByDriver.get(driverId) ?? null,
        damage: damageByDriver.get(driverId) ?? null,
      }));
    });
    return { rows };
  });

  // B-30 — fuel-anomalies: the flattened anomaly worklist (one row per flag, not per driver),
  // for an ops reviewer to scan. Every row states its own evidence — see fuel-driver-scorecard
  // .service.ts's file header for why these are flags to look at, never accusations.
  app.get("/api/v1/maintenance/integrity/fuel-anomalies", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = periodQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const { periodStart, periodEnd } = resolvePeriod(query.data);
    const rows = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const scorecards = await computeDriverFuelScorecard(client, query.data.operating_company_id, periodStart, periodEnd);
      return scorecards.flatMap((driver) =>
        driver.flags.map((flag) => ({
          driver_id: driver.driver_id,
          period_start: periodStart,
          period_end: periodEnd,
          ...flag,
        }))
      );
    });
    return { rows };
  });

  // ROUND 305 B-47 — the fuel component of the integrity score. A driver is a "finding" only when
  // two signals from independent sources agree; one signal is a "suspicion". Every signal carries
  // its arithmetic and its row-level evidence (B-50).
  app.get("/api/v1/maintenance/integrity/fuel-integrity", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = periodQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const { periodStart, periodEnd } = resolvePeriod(query.data);
    return withCompany(user.uuid, query.data.operating_company_id, (client) =>
      computeDriverFuelIntegrity(client, query.data.operating_company_id, periodStart, periodEnd)
    );
  });

  // ROUND 305 B-49 — geofence integrity findings with their driver. Attributed only through the
  // truck's assignment window at occurred_at; anything unplaceable comes back driver_id = null with
  // a named gap_reason. Forward: finding -> driver. Reverse: /findings/driver/:driver_id.
  const findingsQuerySchema = z.object({
    operating_company_id: z.string().uuid(),
    period_start: z.string().datetime({ offset: true }).optional(),
    period_end: z.string().datetime({ offset: true }).optional(),
  });
  app.get("/api/v1/maintenance/integrity/findings", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = findingsQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    return withCompany(user.uuid, query.data.operating_company_id, (client) =>
      listIntegrityFindingsAttribution(client, query.data.operating_company_id, {
        periodStart: query.data.period_start ?? null,
        periodEnd: query.data.period_end ?? null,
      })
    );
  });
  app.get("/api/v1/maintenance/integrity/findings/driver/:driver_id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = findingsQuerySchema.safeParse(req.query ?? {});
    const params = z.object({ driver_id: z.string().uuid() }).safeParse(req.params ?? {});
    if (!query.success || !params.success) return reply.code(400).send({ error: "validation_error" });
    return withCompany(user.uuid, query.data.operating_company_id, (client) =>
      listIntegrityFindingsAttribution(client, query.data.operating_company_id, {
        driverId: params.data.driver_id,
        periodStart: query.data.period_start ?? null,
        periodEnd: query.data.period_end ?? null,
      })
    );
  });

  // ROUND 305 B-48 — every damage / accident / tire event with its driver or the named reason it has
  // none, plus where the events sit in the live fleet (reporting / dark real trucks / placeholders).
  app.get("/api/v1/maintenance/integrity/damage-events", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = periodQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const { periodStart, periodEnd } = resolvePeriod(query.data);
    return withCompany(user.uuid, query.data.operating_company_id, (client) =>
      computeDamageEventAttribution(client, query.data.operating_company_id, periodStart, periodEnd)
    );
  });
}
