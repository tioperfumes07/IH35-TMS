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
  const driverSettlements: Array<Record<string, unknown>> = [];
  if (await relationExists(client, "payroll.driver_settlements")) {
    const res = await client.query(
      `
        SELECT id, driver_id, pay_period_start, pay_period_end, gross_cents, deductions_cents, net_cents, status, bank_settle_date
        FROM payroll.driver_settlements
        WHERE operating_company_id = $1
        ORDER BY pay_period_end DESC
        LIMIT 50
      `,
      [operatingCompanyId]
    );
    driverSettlements.push(...res.rows);
  } else if (await relationExists(client, "driver_finance.driver_settlements")) {
    const res = await client.query(
      `
        SELECT id, driver_id, period_start AS pay_period_start, period_end AS pay_period_end,
               gross_cents, deductions_cents, net_cents, status, NULL::date AS bank_settle_date
        FROM driver_finance.driver_settlements
        WHERE operating_company_id = $1
        ORDER BY period_end DESC
        LIMIT 50
      `,
      [operatingCompanyId]
    );
    driverSettlements.push(...res.rows);
  }

  let qboW2Runs: Array<Record<string, unknown>> = [];
  let syncState = "idle";
  let lastSyncedAt: string | null = null;

  if (await relationExists(client, "integrations.qbo_payroll_links")) {
    const runsRes = await client.query(
      `
        SELECT qbo_payroll_run_id, qbo_payroll_run_name, pay_period_start, pay_period_end,
               gross_cents, net_cents, employee_count, sync_state, last_synced_at
        FROM integrations.qbo_payroll_links
        WHERE operating_company_id = $1 AND archived_at IS NULL
        ORDER BY pay_period_end DESC NULLS LAST
        LIMIT 50
      `,
      [operatingCompanyId]
    );
    qboW2Runs = runsRes.rows;
    const stateRes = await client.query(
      `
        SELECT sync_state, MAX(last_synced_at) AS last_synced_at
        FROM integrations.qbo_payroll_links
        WHERE operating_company_id = $1 AND archived_at IS NULL
        GROUP BY sync_state
        ORDER BY MAX(last_synced_at) DESC NULLS LAST
        LIMIT 1
      `,
      [operatingCompanyId]
    );
    syncState = String(stateRes.rows[0]?.sync_state ?? "idle");
    lastSyncedAt = stateRes.rows[0]?.last_synced_at ? String(stateRes.rows[0].last_synced_at) : null;
  }

  return {
    driver_settlements: driverSettlements,
    qbo_w2_runs: qboW2Runs,
    sync_state: syncState,
    last_synced_at: lastSyncedAt,
    option: "B",
  };
}

export async function refreshAggregatedPayrollSync(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  operatingCompanyId: string
) {
  if (!(await relationExists(client, "integrations.qbo_payroll_links"))) {
    return { sync_state: "idle", refreshed_at: null, updated_rows: 0 };
  }
  const res = await client.query(
    `
      UPDATE integrations.qbo_payroll_links
      SET sync_state = 'polled', last_synced_at = now(), updated_at = now()
      WHERE operating_company_id = $1 AND archived_at IS NULL
      RETURNING id
    `,
    [operatingCompanyId]
  );
  return {
    sync_state: "polled",
    refreshed_at: new Date().toISOString(),
    updated_rows: res.rows.length,
  };
}

export async function registerPayrollAggregatedRoutes(app: FastifyInstance) {
  app.get("/api/v1/payroll/aggregated", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      fetchAggregatedPayroll(client, query.data.operating_company_id)
    );
    return reply.send(payload);
  });

  app.post("/api/v1/payroll/aggregated/refresh", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      refreshAggregatedPayrollSync(client, query.data.operating_company_id)
    );
    return reply.send(payload);
  });
}
