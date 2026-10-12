import type { FastifyInstance } from "fastify";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";

async function relationExists(client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }> }, name: string) {
  const res = await client.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [name]);
  return Boolean((res.rows[0] as { ok?: boolean })?.ok);
}

export async function fetchAggregatedPayroll(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  operatingCompanyId: string
) {
  // ACCT-F4431379 (Lead 443.137 9d) — driver pay comes ONLY from driver_finance. This view used to
  // also read the QBO Payroll W-2 run mirror table and expose a
  // /refresh POST that stamped that mirror 'polled' without contacting QBO. QBO is out of scope for
  // USMCA ("USMCA is entirely our TMS ERP") and no explicit payroll reconciliation screen exists, so
  // the QBO read, its sync-state fields, and the refresh write are removed — not hidden behind a
  // to_regclass probe that would silently return an empty list.
  const driverSettlements: Array<Record<string, unknown>> = [];
  // P2c reader repoint (settlement engine collapse): the RETIRE payroll.driver_settlements read is
  // removed — canonical driver_finance is the ONLY source. NOTE the old canonical fallback selected
  // gross_cents/deductions_cents/net_cents, columns that do NOT exist on the canonical header
  // (it stores dollars: gross_pay/deductions_total/net_pay) — it was dead code that would have
  // errored at runtime. The response contract stays CENTS via ROUND(x * 100).
  if (await relationExists(client, "driver_finance.driver_settlements")) {
    const res = await client.query(
      `
        SELECT id, driver_id, period_start AS pay_period_start, period_end AS pay_period_end,
               ROUND(gross_pay * 100)::bigint AS gross_cents,
               ROUND(deductions_total * 100)::bigint AS deductions_cents,
               ROUND(net_pay * 100)::bigint AS net_cents,
               status, bank_settle_date
        FROM driver_finance.driver_settlements
        WHERE operating_company_id = $1::uuid
        ORDER BY period_end DESC
        LIMIT 50
      `,
      [operatingCompanyId]
    );
    driverSettlements.push(...res.rows);
  }

  return {
    driver_settlements: driverSettlements,
    option: "B",
  };
}

export async function registerPayrollAggregatedRoutes(app: FastifyInstance) {
  app.get("/api/v1/payroll/aggregated", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      fetchAggregatedPayroll(client, query.data.operating_company_id)
    );
    return reply.send(payload);
  });
}
