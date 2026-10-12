/**
 * ACCT-F4431379 (Lead 443.137 9d) — real Postgres: driver pay comes ONLY from driver_finance.
 * Every fixture lives in ONE transaction that is rolled back.
 *
 * A QBO Payroll W-2 run sits in integrations.qbo_payroll_links for the same company. Neither payroll
 * view may read it:
 *  - GET /api/v1/payroll/aggregated (fetchAggregatedPayroll) returns the driver_finance settlement and
 *    no QBO W-2 run list (it used to return the mirror row as qbo_w2_runs);
 *  - the labor aggregate (buildPayrollAggregate) totals driver_finance only — grand_total equals the
 *    settlement's gross pay in cents, never gross + the QBO W-2 run;
 *  - pullTmsSettlements reads the canonical DOLLAR columns (it used to select phantom *_cents columns
 *    and threw 42703 on its first query).
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import * as aggregatedRoutes from "../aggregated.routes.js";
import * as aggregateRoutes from "../../payroll-integration/aggregate.routes.js";
import { pullTmsSettlements } from "../../payroll-integration/tms-settlements-pull.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("payroll views read driver pay from driver_finance only (ACCT-F4431379, real Postgres)", () => {
  it("a QBO W-2 run never reaches the aggregated view or any labor total", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    await ensureIntegrationPrerequisites();
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      const tag = `PDF${Date.now().toString(36).toUpperCase()}`;
      const one = async (sql: string, params: unknown[]) => (await db.query<{ id: string }>(sql, params)).rows[0]!.id;
      const opco = await one(
        `INSERT INTO org.companies (code, legal_name, company_type) VALUES ($1, $2, 'operating_carrier') RETURNING id::text AS id`,
        [tag, `Payroll driver-finance-only test ${tag}`]
      );
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const driver = await one(
        `INSERT INTO mdata.drivers (operating_company_id, first_name, last_name, phone) VALUES ($1::uuid, 'Payroll', $2, '5550001111') RETURNING id::text AS id`,
        [opco, tag]
      );
      const settlement = await one(
        `INSERT INTO driver_finance.driver_settlements
           (operating_company_id, display_id, driver_id, period_start, period_end, status, approval_status, settlement_model,
            gross_pay, deductions_total, net_pay, is_sample_data)
         VALUES ($1::uuid, $2, $3::uuid, DATE '2026-09-07', DATE '2026-09-13', 'paid', 'finalized', 'week_calendar',
                 1234.56, 100.00, 1134.56, true)
         RETURNING id::text AS id`,
        [opco, `SET-${tag}`, driver]
      );
      // The QBO Payroll W-2 run mirror row — out of scope for USMCA, never a source of driver pay.
      await db.query(
        `INSERT INTO integrations.qbo_payroll_links
           (operating_company_id, qbo_payroll_run_id, qbo_payroll_run_name, pay_period_start, pay_period_end, gross_cents, net_cents, employee_count)
         VALUES ($1::uuid, $2, 'W-2 run', DATE '2026-09-07', DATE '2026-09-13', 9900000, 7700000, 4)`,
        [opco, `QBO-${tag}`]
      );

      // 1. the mounted aggregated view: driver_finance rows only, no QBO W-2 run list.
      const view = (await aggregatedRoutes.fetchAggregatedPayroll(db as never, opco)) as Record<string, unknown>;
      const rows = view.driver_settlements as Array<{ id: string; gross_cents: string | number }>;
      expect(rows.map((r) => r.id)).toEqual([settlement]);
      expect(Number(rows[0]!.gross_cents)).toBe(123456);
      expect(view).not.toHaveProperty("qbo_w2_runs");
      expect(JSON.stringify(view)).not.toContain(`QBO-${tag}`);

      // 2. the canonical driver pull reads real columns (dollars -> cents).
      const tms = await pullTmsSettlements(db as never, opco, "2026-09-01", "2026-09-30");
      expect(tms.rows).toHaveLength(1);
      expect(tms.rows[0]).toMatchObject({ driver_id: driver, gross_cents: 123456, deductions_cents: 10000, net_cents: 113456 });
      expect(tms.total_cents).toBe(123456);

      // 3. the labor aggregate totals driver_finance only — the 99,000.00 QBO W-2 run is not added.
      const buildPayrollAggregate = (aggregateRoutes as Record<string, unknown>).buildPayrollAggregate as
        | ((c: unknown, co: string, s: string, e: string) => Promise<Record<string, unknown>>)
        | undefined;
      expect(typeof buildPayrollAggregate).toBe("function");
      const agg = await buildPayrollAggregate!(db, opco, "2026-09-01", "2026-09-30");
      expect(agg.grand_total).toBe(123456);
      expect(agg.driver_total).toBe(123456);
      expect(agg).not.toHaveProperty("w2_total");
      expect((agg.by_person as Array<{ pay_type: string }>).map((p) => p.pay_type)).toEqual(["1099"]);
    } finally {
      await db.query("ROLLBACK").catch(() => undefined);
      await db.end();
    }
  });
});
