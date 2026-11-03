import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerEquipmentTypeProfitabilityRoutes } from "../equipment-type-profitability.routes.js";

/**
 * Codex batch54 — equipment-type profitability must exclude void/voided driver bills from
 * direct_cost. Same load can carry a live bill + a dead bill; only live gross counts.
 */
const companyId = "44444444-4444-4444-8444-444444444444";

const LIVE_BILL_CENTS = 100_000;
const VOID_BILL_CENTS = 1_398_554; // mirrors Codex USMCA sample contribution shape
const FUEL_CENTS = 20_000;
const REVENUE_CENTS = 500_000;

const capturedSql: string[] = [];

vi.mock("../shared.js", async () => {
  const actual = await vi.importActual<typeof import("../shared.js")>("../shared.js");
  return {
    ...actual,
    currentAuthUser: vi.fn(() => ({ uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", role: "Owner" })),
    withCompanyScope: vi.fn(async (_userId: string, _companyId: string, fn: (client: any) => Promise<any>) => {
      const client = {
        query: vi.fn(async (sql: string) => {
          capturedSql.push(sql);
          // Simulate DB aggregation AFTER the live-bill predicate: void bill never reaches SUM.
          const liveDirect = LIVE_BILL_CENTS + FUEL_CENTS;
          return {
            rows: [
              {
                equipment_code: "DRY",
                equipment_label: "Dry van",
                load_count: 1,
                miles: 500,
                revenue_cents: String(REVENUE_CENTS),
                direct_cost_cents: String(liveDirect),
              },
            ],
          };
        }),
      };
      return fn(client);
    }),
  };
});

describe("equipment-type-profitability — dead bills excluded from direct cost", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    capturedSql.length = 0;
    app = Fastify();
    await registerEquipmentTypeProfitabilityRoutes(app);
  });
  afterEach(async () => {
    await app.close();
  });

  it("SQL bills CTE requires voided_at IS NULL and status NOT IN (void, voided)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/equipment-type-profitability?operating_company_id=${companyId}&period_start=2026-08-01&period_end=2026-11-02`,
    });
    expect(res.statusCode).toBe(200);
    const sql = capturedSql.find((s) => s.includes("driver_finance.driver_bills"));
    expect(sql, "expected equipment-type bills CTE SQL").toBeTruthy();
    expect(sql!).toMatch(/voided_at\s+IS\s+NULL/i);
    expect(sql!).toMatch(/status\s+NOT\s+IN\s*\(\s*'void'\s*,\s*'voided'\s*\)/i);
  });

  it("same-load live+void fixture: margin uses only live bill + fuel (void gross ignored)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/equipment-type-profitability?operating_company_id=${companyId}&period_start=2026-08-01&period_end=2026-11-02`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      by_type: Array<{ direct_cost_cents: number; gross_margin_cents: number; revenue_cents: number }>;
      totals: { direct_cost_cents: number; revenue_cents: number };
    };
    const liveDirect = LIVE_BILL_CENTS + FUEL_CENTS;
    const inflatedIfVoidCounted = liveDirect + VOID_BILL_CENTS;
    expect(body.by_type[0].direct_cost_cents).toBe(liveDirect);
    expect(body.by_type[0].direct_cost_cents).not.toBe(inflatedIfVoidCounted);
    expect(body.by_type[0].gross_margin_cents).toBe(REVENUE_CENTS - liveDirect);
    expect(body.totals.direct_cost_cents).toBe(liveDirect);
  });
});
