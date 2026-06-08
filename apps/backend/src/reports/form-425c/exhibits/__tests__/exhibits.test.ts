import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calculateUsTrusteeQuarterlyFeeCents } from "../exhibit-d-quarterly-fees.js";
import { buildAllExhibits, getBuiltExhibits } from "../exhibits-builder.service.js";
import { registerForm425cExhibitsRoutes } from "../routes.js";

const companyId = "44444444-4444-4444-8444-444444444444";

vi.mock("../../../shared.js", async () => {
  const actual = await vi.importActual<typeof import("../../../shared.js")>("../../../shared.js");
  return {
    ...actual,
    currentAuthUser: vi.fn(() => ({ uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", role: "Owner" })),
    withCompanyScope: vi.fn(async (_userId: string, _companyId: string, fn: (client: any) => Promise<any>) => {
      const client = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes("banking.bank_transactions") && sql.includes("bt.amount > 0")) {
            return {
              rows: [
                { description: "Customer payment", counterparty: "ACME Freight", amount: "1500.25" },
                { description: "Factor advance", counterparty: "Triumph", amount: "800" },
              ],
            };
          }
          if (sql.includes("banking.bank_transactions") && sql.includes("bt.amount < 0") && sql.includes("disbursements")) {
            return { rows: [{ disbursements: "250000" }] };
          }
          if (sql.includes("banking.bank_transactions") && sql.includes("bt.amount < 0")) {
            return {
              rows: [{ description: "Fuel purchase", counterparty: "Pilot", amount: "420.50" }],
            };
          }
          if (sql.includes("banking.bank_accounts")) {
            return {
              rows: [
                {
                  id: "11111111-1111-4111-8111-111111111111",
                  name: "DIP Operating",
                  mask: "3500",
                  opening_balance: "10000",
                  inflows: "5000",
                  outflows: "2000",
                },
              ],
            };
          }
          if (sql.includes("accounting.invoices")) return { rows: [] };
          if (sql.includes("accounting.bills")) return { rows: [] };
          return { rows: [] };
        }),
      };
      return fn(client);
    }),
  };
});

vi.mock("../exhibit-e-statements-summary.js", () => ({
  buildExhibitE: vi.fn(async () => ({
    letter: "e",
    title: "Exhibit E — Statements summary (P&L, BS, CF)",
    period_start: "2026-05-01",
    period_end: "2026-05-31",
    snapshots: [],
  })),
}));

describe("form-425c exhibits", () => {
  describe("calculateUsTrusteeQuarterlyFeeCents", () => {
    it("matches statute tiers exactly", () => {
      expect(calculateUsTrusteeQuarterlyFeeCents(1_000_000)).toEqual({
        fee_cents: 32_500,
        tier_label: "≤ $14,999.99 → $325",
      });
      expect(calculateUsTrusteeQuarterlyFeeCents(5_000_000)).toEqual({
        fee_cents: 55_000,
        tier_label: "$15,000–$74,999.99 → $550",
      });
      expect(calculateUsTrusteeQuarterlyFeeCents(50_000_000)).toEqual({
        fee_cents: 272_500,
        tier_label: "$500,000–$999,999.99 → $2,725",
      });
      expect(calculateUsTrusteeQuarterlyFeeCents(150_000_000).fee_cents).toBe(987_500);
    });
  });

  describe("buildAllExhibits", () => {
    it("builds all six exhibits sequentially", async () => {
      const client = { query: vi.fn(async () => ({ rows: [] })) };
      const built = await buildAllExhibits(client, {
        userId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        operating_company_id: companyId,
        period_start: "2026-05-01",
        period_end: "2026-05-31",
      });
      expect(built.exhibits.a).toBeTruthy();
      expect(built.exhibits.b).toBeTruthy();
      expect(built.exhibits.c).toBeTruthy();
      expect(built.exhibits.d).toBeTruthy();
      expect(built.exhibits.e).toBeTruthy();
      expect(built.exhibits.f).toBeTruthy();
      expect(getBuiltExhibits(built.filing_uuid)).toEqual(built);
    });
  });

  describe("routes", () => {
    let app: FastifyInstance;
    beforeEach(async () => {
      app = Fastify();
      await registerForm425cExhibitsRoutes(app);
    });
    afterEach(async () => {
      await app.close();
    });

    it("POST build returns all exhibits", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/reports/form-425c/exhibits/build",
        payload: {
          operating_company_id: companyId,
          period_start: "2026-05-01",
          period_end: "2026-05-31",
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as Record<string, any>;
      expect(body.filing_uuid).toBeTruthy();
      expect(body.exhibits.a.rows.length).toBeGreaterThan(0);
    });

    it("GET single exhibit by letter", async () => {
      const buildRes = await app.inject({
        method: "POST",
        url: "/api/v1/reports/form-425c/exhibits/build",
        payload: {
          operating_company_id: companyId,
          period_start: "2026-05-01",
          period_end: "2026-05-31",
        },
      });
      const filingUuid = (buildRes.json() as { filing_uuid: string }).filing_uuid;
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/reports/form-425c/exhibits/${filingUuid}/exhibit/d?operating_company_id=${companyId}`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as Record<string, any>;
      expect(body.letter).toBe("d");
      expect(body.exhibit.fee_cents).toBe(132_500);
    });
  });
});
