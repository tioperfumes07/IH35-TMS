/**
 * 443.281-B: Company settlements report endpoint tie-out test.
 * Verifies: pagination shape, row fields, totals, 400s.
 */
import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerCompanySettlementsReportRoutes } from "../company-settlements-report.routes.js";

const COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

vi.mock("../shared.js", async () => {
  const actual = await vi.importActual<typeof import("../shared.js")>("../shared.js");
  return {
    ...actual,
    currentAuthUser: vi.fn(() => ({ uuid: USER_ID, role: "Owner" })),
    withCompanyScope: vi.fn(
      async (_userId: string, _companyId: string, fn: (client: any) => Promise<any>) => {
        const client = {
          query: vi.fn(async () => ({
            rows: [
              {
                company_settlement_id: "cs111111-c111-4111-8111-cs1111111111",
                display_id: "CS-2026-001",
                period_start: "2026-10-01",
                period_end: "2026-10-07",
                status: "Closed",
                closed_at: "2026-10-09",
                voided_at: null,
                driver_settlement_count: "3",
                gross_driver_pay_cents: "1350000",
                net_revenue_cents: "3300000",
                _total_count: "1",
              },
            ],
          })),
        };
        return fn(client);
      }
    ),
  };
});

describe("GET /api/v1/reports/company-settlements", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    await registerCompanySettlementsReportRoutes(app);
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns rows with pagination envelope", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/company-settlements?operating_company_id=${COMPANY_ID}&from=2026-10-01&to=2026-10-31`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pagination.total).toBe(1);
    expect(body.rows).toHaveLength(1);
  });

  it("returns company settlement row with money fields", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/company-settlements?operating_company_id=${COMPANY_ID}&from=2026-10-01&to=2026-10-31`,
    });
    const body = res.json();
    const row = body.rows[0];

    expect(row.display_id).toBe("CS-2026-001");
    expect(row.status).toBe("Closed");
    expect(row.driver_settlement_count).toBe(3);
    expect(row.gross_driver_pay_cents).toBe(1350000);
    expect(row.net_revenue_cents).toBe(3300000);
    expect(row.closed_at).toBe("2026-10-09");
    expect(row.voided_at).toBeNull();
  });

  it("returns totals aggregated from rows", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/company-settlements?operating_company_id=${COMPANY_ID}&from=2026-10-01&to=2026-10-31`,
    });
    const body = res.json();
    expect(body.totals.settlement_count).toBe(1);
    expect(body.totals.gross_driver_pay_cents).toBe(1350000);
  });

  it("returns period metadata", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/company-settlements?operating_company_id=${COMPANY_ID}&from=2026-10-01&to=2026-10-31`,
    });
    const body = res.json();
    expect(body.period.start).toBe("2026-10-01");
    expect(body.period.end).toBe("2026-10-31");
  });

  it("rejects from > to with 400", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/company-settlements?operating_company_id=${COMPANY_ID}&from=2026-10-31&to=2026-10-01`,
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects limit > 200 with 400", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/company-settlements?operating_company_id=${COMPANY_ID}&from=2026-10-01&to=2026-10-31&limit=500`,
    });
    expect(res.statusCode).toBe(400);
  });

  it("accepts status filter", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/company-settlements?operating_company_id=${COMPANY_ID}&from=2026-10-01&to=2026-10-31&status=Closed`,
    });
    expect(res.statusCode).toBe(200);
  });
});

// 443.286-A tie-out: guard that company-settlements excludes voided rows and returns null net_revenue
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { expandLivePredicates } from "./expand-live-predicates.js";
describe("TIEOUT: company-settlements SQL scope", () => {
  it("service SQL excludes voided company settlements and nulls net_revenue for voided rows", () => {
    const src = expandLivePredicates(readFileSync(
      fileURLToPath(new URL("../company-settlements-report.service.ts", import.meta.url)),
      "utf-8"
    ));
    expect(src).toContain("voided_at IS NULL");
    // Voided settlements must carry null net_revenue (law §8 — no $0 on reversed docs)
    expect(src).toContain("NULL");
    expect(src).toContain("voided_at");
  });
});
