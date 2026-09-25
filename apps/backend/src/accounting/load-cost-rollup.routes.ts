import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { loadCostRollupLateral, LOAD_COST_ROLLUP_SELECT } from "./load-cost-rollup.sql.js";

/**
 * LAW 5 / R-151.3 (owner, 2026-09-23/24): "no surface computes margin on its own." This is the ONE
 * HTTP surface for the canonical per-load revenue/costs/driver_pay/margin — every frontend screen
 * that needs those four numbers for one load calls this, never re-derives them from its own list
 * fetches. Thin wrapper: the money is entirely in loadCostRollupLateral (load-cost-rollup.sql.ts),
 * the same lateral already relied on by load-unit-cost-split.routes.ts and factoring.routes.ts.
 *
 *   GET /api/v1/accounting/loads/:loadId/cost-rollup?operating_company_id=…
 *   GET /api/v1/accounting/loads/cost-rollup?operating_company_id=…&load_ids=…  (batch, ROUND 153)
 *
 * The batch route exists for the Load Board list/table view (many rows, one request) — same
 * shape as mdata/settlement-ref.routes.ts's batch settlement-refs endpoint (ALL-SEATS LAW,
 * owner 2026-09-13: "one shared batch read"), same canonical query, no second formula.
 */

const loadParams = z.object({ loadId: z.string().uuid() });
const batchQuerySchema = companyQuerySchema.extend({
  load_ids: z
    .string()
    .min(1)
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(z.string().uuid()).min(1).max(500)),
});

type Db = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export type LoadCostRollup = {
  load_id: string;
  load_number: string | null;
  revenue_cents: number;
  /** ROUND 173 pt 4 (Lead, 2026-09-25) — fuel split out of costs_cents (source_fuel_transaction_id
   *  IS NOT NULL, LAW 4: diesel/DEF/reefer is never a regular expense). */
  fuel_cents: number;
  /** Non-fuel costs: regular (non-fuel) accounting.expenses + load-scoped bill_lines. Always
   *  fuel_cents + expenses_cents === costs_cents. */
  expenses_cents: number;
  costs_cents: number;
  driver_pay_cents: number;
  margin_cents: number;
  /** ROUND 173's own name for margin_cents (same value) — the "net" column in the 5-board spec. */
  net_cents: number;
  margin_pct: number | null;
};

const num = (v: unknown) => (v == null ? 0 : Number(v));

export async function buildLoadCostRollup(client: Db, companyId: string, loadId: string): Promise<LoadCostRollup | null> {
  const res = await client.query<{
    lc_load_number: string | null;
    lc_revenue_cents: string;
    lc_fuel_cents: string;
    lc_expenses_cents: string;
    lc_costs_cents: string;
    lc_driver_pay_cents: string;
    lc_margin_cents: string;
    lc_net_cents: string;
  }>(
    `SELECT ${LOAD_COST_ROLLUP_SELECT}
       FROM mdata.loads l
       ${loadCostRollupLateral("l.id", "l.operating_company_id")}
      WHERE l.id = $1 AND l.operating_company_id = $2::uuid AND l.soft_deleted_at IS NULL`,
    [loadId, companyId]
  );
  const row = res.rows[0];
  if (!row) return null;
  const revenue = num(row.lc_revenue_cents);
  const margin = num(row.lc_margin_cents);
  return {
    load_id: loadId,
    load_number: row.lc_load_number,
    revenue_cents: revenue,
    fuel_cents: num(row.lc_fuel_cents),
    expenses_cents: num(row.lc_expenses_cents),
    costs_cents: num(row.lc_costs_cents),
    driver_pay_cents: num(row.lc_driver_pay_cents),
    margin_cents: margin,
    net_cents: num(row.lc_net_cents),
    margin_pct: revenue > 0 ? Math.round((margin / revenue) * 1000) / 10 : null,
  };
}

export async function buildLoadCostRollupBatch(client: Db, companyId: string, loadIds: string[]): Promise<LoadCostRollup[]> {
  const res = await client.query<{
    load_id: string;
    lc_load_number: string | null;
    lc_revenue_cents: string;
    lc_fuel_cents: string;
    lc_expenses_cents: string;
    lc_costs_cents: string;
    lc_driver_pay_cents: string;
    lc_margin_cents: string;
    lc_net_cents: string;
  }>(
    `SELECT l.id::text AS load_id, ${LOAD_COST_ROLLUP_SELECT}
       FROM mdata.loads l
       ${loadCostRollupLateral("l.id", "l.operating_company_id")}
      WHERE l.operating_company_id = $1::uuid AND l.id = ANY($2::uuid[])`,
    [companyId, loadIds]
  );
  return res.rows.map((row) => {
    const revenue = num(row.lc_revenue_cents);
    const margin = num(row.lc_margin_cents);
    return {
      load_id: row.load_id,
      load_number: row.lc_load_number,
      revenue_cents: revenue,
      fuel_cents: num(row.lc_fuel_cents),
      expenses_cents: num(row.lc_expenses_cents),
      costs_cents: num(row.lc_costs_cents),
      driver_pay_cents: num(row.lc_driver_pay_cents),
      margin_cents: margin,
      net_cents: num(row.lc_net_cents),
      margin_pct: revenue > 0 ? Math.round((margin / revenue) * 1000) / 10 : null,
    };
  });
}

export async function registerLoadCostRollupRoutes(app: FastifyInstance) {
  // ROUND 153 — batch route registered FIRST: Fastify matches static/param routes by
  // registration order among siblings, and "/cost-rollup" must not be swallowed by the
  // "/:loadId/cost-rollup" pattern (it wouldn't be, different path shapes, but keeping the
  // more specific static route first is the same defensive order every other batch-vs-single
  // pair in this codebase already uses).
  app.get(
    "/api/v1/accounting/loads/cost-rollup",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      const q = batchQuerySchema.safeParse(req.query ?? {});
      if (!q.success) return validationError(reply, q.error);
      const rows = await withCompanyScope(user.uuid, q.data.operating_company_id, (client) =>
        buildLoadCostRollupBatch(client as unknown as Db, q.data.operating_company_id, q.data.load_ids)
      );
      return { rollups: rows };
    }
  );
  app.get(
    "/api/v1/accounting/loads/:loadId/cost-rollup",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      const p = loadParams.safeParse(req.params ?? {});
      if (!p.success) return validationError(reply, p.error);
      const q = companyQuerySchema.safeParse(req.query ?? {});
      if (!q.success) return validationError(reply, q.error);
      const out = await withCompanyScope(user.uuid, q.data.operating_company_id, (client) =>
        buildLoadCostRollup(client as unknown as Db, q.data.operating_company_id, p.data.loadId)
      );
      if (!out) return reply.code(404).send({ error: "load_not_found" });
      return out;
    }
  );
}

export default fp(
  async (app) => {
    await registerLoadCostRollupRoutes(app);
  },
  { name: "accounting.registerLoadCostRollupRoutes" }
);
