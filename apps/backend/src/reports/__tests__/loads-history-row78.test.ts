/**
 * Row 78 — Dispatch › Load history board reads GET /api/v1/reports/loads-history. Locks the additions:
 * include_cancelled lifts ONLY the cancelled exclusion, status counts always count cancelled, rows carry the load's
 * empty (deadhead) miles, and the totals carry loaded / empty miles, delivered-not-invoiced and customer count.
 */
import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerLoadsHistoryRoutes } from "../loads-history.routes.js";
import { loadsHistoryScopeSql } from "../loads-history.service.js";

const COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const calls: Array<{ sql: string; values: unknown[] }> = [];

vi.mock("../shared.js", async () => {
  const actual = await vi.importActual<typeof import("../shared.js")>("../shared.js");
  return {
    ...actual,
    currentAuthUser: vi.fn(() => ({ uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", role: "Owner" })),
    withCompanyScope: vi.fn(async (_u: string, _c: string, fn: (client: any) => Promise<any>) => {
      const client = {
        query: vi.fn(async (sql: string, values: unknown[]) => {
          calls.push({ sql, values });
          const n = calls.length - 1;
          if (n === 0) {
            return {
              rows: [
                {
                  load_id: "11111111-1111-4111-8111-111111111111",
                  load_number: "13689",
                  status: "invoiced",
                  miles_practical: "1558.7",
                  miles_deadhead: "328",
                  lc_revenue_cents: "400000",
                  lc_driver_pay_cents: "84911",
                  lc_fuel_cents: "0",
                  lc_margin_cents: "315089",
                  _total_count: "194",
                },
              ],
            };
          }
          if (n === 1) {
            return {
              rows: [
                {
                  load_count: "194",
                  revenue_cents: "66927672",
                  driver_pay_cents: "0",
                  fuel_cents: "0",
                  margin_cents: "0",
                  ar_invoice_count: "191",
                  ar_invoice_amount_cents: "0",
                  loaded_miles: "298185.5",
                  empty_miles: "23099.9",
                  delivered_not_invoiced: "3",
                  customer_count: "85",
                },
              ],
            };
          }
          return {
            rows: [
              { status: "invoiced", count: 125 },
              { status: "closed", count: 56 },
              { status: "delivered_pending_docs", count: 13 },
              { status: "cancelled", count: 4 },
            ],
          };
        }),
      };
      return fn(client);
    }),
  };
});

describe("Row 78 — loads-history additions", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    calls.length = 0;
    app = Fastify();
    await registerLoadsHistoryRoutes(app);
  });
  afterEach(async () => {
    await app.close();
  });

  it("default scope excludes cancelled; status counts include cancelled", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/loads-history?operating_company_id=${COMPANY_ID}&from=2000-01-01&to=2026-11-03&limit=200`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(calls[0].sql).toContain("NOT IN ('draft', 'cancelled', 'voided')");
    expect(calls[2].sql).toContain("NOT IN ('draft', 'voided')");
    expect(calls[2].sql).toContain("GROUP BY l.status");
    expect(body.status_counts.reduce((s: number, c: { count: number }) => s + c.count, 0)).toBe(198);
    expect(body.status_counts.find((c: { status: string }) => c.status === "cancelled").count).toBe(4);
    expect(body.rows[0].miles_deadhead).toBe(328);
    expect(body.totals.loaded_miles).toBe(298185.5);
    expect(body.totals.empty_miles).toBe(23099.9);
    expect(body.totals.delivered_not_invoiced).toBe(3);
    expect(body.totals.customer_count).toBe(85);
  });

  it("include_cancelled=true lifts only the cancelled exclusion", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/loads-history?operating_company_id=${COMPANY_ID}&from=2000-01-01&to=2026-11-03&include_cancelled=true`,
    });
    expect(res.statusCode).toBe(200);
    expect(calls[0].sql).toContain("NOT IN ('draft', 'voided')");
    expect(calls[0].sql).not.toContain("NOT IN ('draft', 'cancelled', 'voided')");
    expect(calls[0].sql).toContain("l.is_sample_data IS NOT TRUE");
    expect(calls[0].sql).toContain("l.voided_at IS NULL");
  });

  it("status filter does not narrow the status counts", async () => {
    await app.inject({
      method: "GET",
      url: `/api/v1/reports/loads-history?operating_company_id=${COMPANY_ID}&from=2000-01-01&to=2026-11-03&status=invoiced`,
    });
    expect(calls[0].values).toContain("invoiced");
    expect(calls[2].values).not.toContain("invoiced");
  });

  it("scope helper keeps deleted / voided / sample exclusions either way", () => {
    for (const flag of [true, false]) {
      const s = loadsHistoryScopeSql(flag).join(" ");
      expect(s).toContain("l.soft_deleted_at IS NULL");
      expect(s).toContain("l.voided_at IS NULL");
      expect(s).toContain("l.is_sample_data IS NOT TRUE");
      expect(s).toContain("'draft'");
    }
  });

  it("totals de-duplicate the invoice fan-out (sums count each load once)", async () => {
    await app.inject({ method: "GET", url: `/api/v1/reports/loads-history?operating_company_id=${COMPANY_ID}&from=2000-01-01&to=2026-11-03` });
    expect(calls[1].sql).toContain("first_inv");
    expect(calls[1].sql).toMatch(/SUM\(lc\.lc_revenue_cents\) FILTER \(WHERE inv\.id IS NULL OR inv\.id = first_inv\.id\)/);
  });
});
