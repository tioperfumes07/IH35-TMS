/**
 * CLOSURE-12 — Payroll integration aggregate routes.
 * GET /api/v1/payroll-integration/aggregate?period_start=&period_end=
 * POST /api/v1/payroll-integration/aggregate/refresh
 */
import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { pullTmsSettlements } from "./tms-settlements-pull.js";
import { pullQboPayroll } from "./qbo-payroll-pull.js";
import { allocatePayrollClass, buildClassSummary, type PersonAllocation } from "./class-allocator.js";

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
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${companyId}'`);
    return fn(client as Parameters<typeof fn>[0]);
  });
}

export async function registerPayrollIntegrationRoutes(app: FastifyInstance) {
  app.get("/api/v1/payroll-integration/aggregate", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const parsed = periodQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const { operating_company_id, period_start, period_end } = parsed.data;

    const result = await withCompany(user.uuid, operating_company_id, async (client) => {
      const [tms, qbo] = await Promise.all([
        pullTmsSettlements(client, operating_company_id, period_start, period_end),
        pullQboPayroll(client, operating_company_id, period_start, period_end),
      ]);

      const persons: PersonAllocation[] = [
        ...tms.rows.map((r) => ({
          person_id: r.driver_id,
          person_name: r.driver_name,
          pay_type: "1099" as const,
          class: allocatePayrollClass("1099"),
          gross_cents: r.gross_cents,
          deductions_cents: r.deductions_cents,
          net_cents: r.net_cents,
        })),
        ...qbo.rows.map((r) => ({
          person_id: r.employee_id,
          person_name: r.employee_name,
          pay_type: "W2" as const,
          class: allocatePayrollClass("W2"),
          gross_cents: r.gross_cents,
          deductions_cents: r.deductions_cents,
          net_cents: r.net_cents,
        })),
      ];

      const by_class = buildClassSummary(persons);
      const grand_total = tms.total_cents + qbo.total_gross_cents;

      return {
        period_start,
        period_end,
        driver_total: tms.total_cents,
        w2_total: qbo.total_gross_cents,
        benefits: qbo.total_benefits_cents,
        taxes: qbo.total_taxes_cents,
        grand_total,
        by_class,
        by_person: persons,
        stale: false,
      };
    });

    return result;
  });

  app.post("/api/v1/payroll-integration/aggregate/refresh", async (req, reply) => {
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
