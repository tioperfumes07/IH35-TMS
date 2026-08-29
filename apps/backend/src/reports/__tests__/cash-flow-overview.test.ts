import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerCashFlowOverviewRoutes } from "../cash-flow-overview.routes.js";
import { withCompanyScope } from "../shared.js";

const companyId = "11111111-1111-4111-8111-111111111111";

vi.mock("../shared.js", async () => {
  const actual = await vi.importActual<typeof import("../shared.js")>("../shared.js");
  return {
    ...actual,
    currentAuthUser: vi.fn(() => ({ uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", role: "Owner" })),
    withCompanyScope: vi.fn(async (_userId: string, _companyId: string, fn: (client: any) => Promise<any>) => {
      const client = {
        query: vi.fn(async (sql: string) => {
          // GO-0046: payroll/dip sub-totals (name-matched, scoped to Plaid-linked depository accounts)
          // and the authoritative total (sumAuthoritativeDepositoryCashCents's two legs — Plaid-linked
          // depository SUM, and non-Plaid internal-wallet ledger SUM) are now three separate queries.
          if (sql.includes("FROM banking.bank_accounts") && sql.includes("payroll_cents")) {
            return { rows: [{ payroll_cents: "10000", dip_cents: "5000" }] };
          }
          if (sql.includes("FROM banking.bank_accounts") && sql.includes("account_class = 'depository'") && sql.includes("total_cash")) {
            return { rows: [{ total_cash: "25000" }] };
          }
          if (sql.includes("FROM banking.bank_transactions") && sql.includes("internal_total")) {
            return { rows: [{ internal_total: "0" }] };
          }
          if (sql.includes("FROM views.factoring_summary")) {
            return { rows: [{ reserve_balance: "12.34", mtd_advanced_total: "56.78", chargeback_balance: "9.01" }] };
          }
          if (sql.includes("COUNT(*)") && sql.includes("bank_transactions") && sql.includes("plaid_category")) {
            return { rows: [{ c: "3" }] };
          }
          if (sql.includes("FROM accounting.invoices")) {
            return { rows: [{ amt: "900000" }] };
          }
          if (sql.includes("FROM accounting.bills")) {
            return { rows: [{ amt: "400000" }] };
          }
          if (sql.includes("FROM driver_finance.driver_settlements")) {
            return { rows: [{ amt: "250000" }] };
          }
          if (sql.includes("INTERVAL '7 days'")) {
            return { rows: [{ inflow: "7000", outflow: "3000" }] };
          }
          if (sql.includes("INTERVAL '30 days'")) {
            return { rows: [{ inflow: "30000", outflow: "15000" }] };
          }
          return { rows: [] };
        }),
      };
      return fn(client);
    }),
  };
});

describe("cash-flow-overview.routes", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = Fastify();
    await registerCashFlowOverviewRoutes(app);
  });
  afterEach(async () => {
    await app.close();
  });

  it("aggregates balances, factoring, projections, and historical averages", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/cash-flow-overview?operating_company_id=${companyId}&as_of_date=2026-05-01`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, any>;
    expect(body.current_state.operating_balance_cents).toBe(10000);
    expect(body.current_state.payroll_balance_cents).toBe(10000);
    expect(body.current_state.dip_balance_cents).toBe(5000);
    expect(body.current_state.factoring_reserves_held_cents).toBe(1234);
    expect(body.current_state.uncategorized_transactions_count).toBe(3);
    expect(body.next_30_days.net_projected_change_cents).toBe(900000 - 400000 - 250000);
    expect(body.historical.last_30_days_avg_daily_inflow_cents).toBe(1000);
    expect(body.historical.last_30_days_avg_daily_outflow_cents).toBe(500);
  });

  // GO-0046: CASHFLOW-OVERVIEW-NON-DEPOSITORY-BALANCE-LEAK regression proof. The route used to
  // SUM(current_balance_cents) over every is_active bank_accounts row with no account_class filter,
  // so a credit-card-class Plaid account would inflate "Operating balance", and a non-Plaid internal
  // wallet (frozen at 0 in that column) would silently contribute $0 regardless of its real ledger
  // balance. This asserts the fix's two load-bearing properties: (1) the payroll/dip sub-query is
  // scoped to account_class='depository' AND plaid_item_id IS NOT NULL — a credit-card row can no
  // longer masquerade as a payroll/DIP bucket; (2) the total is composed from
  // sumAuthoritativeDepositoryCashCents's two legs (Plaid-linked depository SUM + non-Plaid ledger
  // SUM) rather than a single raw unfiltered SUM — so a non-Plaid wallet's real ledger balance
  // actually reaches "Operating balance" instead of reading as a frozen $0.
  it("scopes payroll/dip to depository Plaid accounts and includes non-Plaid ledger balance in the total", async () => {
    const queries: string[] = [];
    vi.mocked(withCompanyScope).mockImplementationOnce(
      async (_u: string, _c: string, fn: (client: any) => Promise<any>) => {
        const client = {
          query: vi.fn(async (sql: string) => {
            queries.push(sql);
            if (sql.includes("FROM banking.bank_accounts") && sql.includes("payroll_cents")) {
              return { rows: [{ payroll_cents: "0", dip_cents: "0" }] };
            }
            // Plaid-linked depository leg — must NOT include the credit-card balance a raw unfiltered
            // SUM would have picked up.
            if (sql.includes("FROM banking.bank_accounts") && sql.includes("account_class = 'depository'") && sql.includes("total_cash")) {
              return { rows: [{ total_cash: "500000" }] };
            }
            // Non-Plaid internal-wallet ledger leg — a real, nonzero balance that the old raw-column
            // read would have silently reported as $0.
            if (sql.includes("FROM banking.bank_transactions") && sql.includes("internal_total")) {
              return { rows: [{ internal_total: "120000" }] };
            }
            return { rows: [] };
          }),
        };
        return fn(client);
      }
    );

    // A distinct as_of_date from the prior test — the route caches its payload by
    // `${companyId}:${asOf}` and the prior test already populated that TTL cache entry.
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/cash-flow-overview?operating_company_id=${companyId}&as_of_date=2026-05-02`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, any>;
    // 500000 (Plaid depository) + 120000 (non-Plaid ledger) — the non-Plaid wallet's real balance is
    // NOT silently dropped.
    expect(body.current_state.operating_balance_cents).toBe(620000);

    const payrollDipQuery = queries.find((q) => q.includes("payroll_cents"));
    expect(payrollDipQuery).toBeTruthy();
    expect(payrollDipQuery).toContain("account_class = 'depository'");
    expect(payrollDipQuery).toContain("plaid_item_id IS NOT NULL");
    // The fix must never issue the old raw, unfiltered SUM(current_balance_cents) query with no
    // account_class predicate at all.
    expect(queries.some((q) => q.includes("SUM(current_balance_cents), 0)::text AS total_cents"))).toBe(false);
  });
});
