/**
 * CLOSURE-12 — Payroll integration aggregate routes.
 * GET /api/v1/payroll-integration/aggregate?period_start=&period_end=
 * POST /api/v1/payroll-integration/aggregate/refresh
 */
import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { requireAuth } from "../auth/session-middleware.js";
import { pullTmsSettlements } from "./tms-settlements-pull.js";
import { allocatePayrollClass, buildClassSummary, type PersonAllocation } from "./class-allocator.js";

type Queryable = { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> };

/**
 * ACCT-F4431379 (Lead 443.137 9d) — the labor-cost aggregate. Driver pay comes ONLY from
 * driver_finance (pullTmsSettlements). This used to add a QBO Payroll pull (qbo-payroll-pull.ts, reading
 * a QBO payroll link table that was never migrated) into w2_total / benefits / taxes / grand_total.
 * QBO is out of scope for USMCA and no explicit payroll reconciliation screen exists, so the QBO
 * read is removed from every total rather than kept as a second source of pay.
 */
export async function buildPayrollAggregate(client: Queryable, operatingCompanyId: string, periodStart: string, periodEnd: string) {
  const tms = await pullTmsSettlements(client, operatingCompanyId, periodStart, periodEnd);
  const persons: PersonAllocation[] = tms.rows.map((r) => ({
    person_id: r.driver_id,
    person_name: r.driver_name,
    pay_type: "1099" as const,
    class: allocatePayrollClass("1099"),
    gross_cents: r.gross_cents,
    deductions_cents: r.deductions_cents,
    net_cents: r.net_cents,
  }));
  return {
    period_start: periodStart,
    period_end: periodEnd,
    driver_total: tms.total_cents,
    grand_total: tms.total_cents,
    by_class: buildClassSummary(persons),
    by_person: persons,
    stale: false,
  };
}

const periodQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

async function withCompany<T>(
  userId: string,
  companyId: string,
  fn: (client: { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> }) => Promise<T>
): Promise<T> {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    return fn(client as Parameters<typeof fn>[0]);
  });
}

export async function registerPayrollIntegrationRoutes(app: FastifyInstance) {
  app.get("/api/v1/payroll-integration/aggregate", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const parsed = periodQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const { operating_company_id, period_start, period_end } = parsed.data;

    const result = await withCompany(user.uuid, operating_company_id, (client) =>
      buildPayrollAggregate(client, operating_company_id, period_start, period_end)
    );

    return result;
  });

  app.post("/api/v1/payroll-integration/aggregate/refresh", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!["Owner", "Administrator"].includes(user.role)) return reply.code(403).send({ error: "forbidden" });

    const parsed = periodQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    return reply.code(200).send({ status: "refreshed", refreshed_at: new Date().toISOString() });
  });
}

export default fp(
  async (app) => { await registerPayrollIntegrationRoutes(app); },
  { name: "payroll-integration.aggregate" }
);
