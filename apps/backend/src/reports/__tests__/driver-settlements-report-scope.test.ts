/**
 * 443.281-B: Driver settlements report endpoint tie-out test.
 * Verifies: pagination shape, totals, driver linkage, 400s.
 */
import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerDriverSettlementsReportRoutes } from "../driver-settlements-report.routes.js";

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
                settlement_id: "s1s1s1s1-s1s1-4111-8111-s1s1s1s1s1s1",
                settlement_number: "SET-2026-001",
                driver_id: "d1d1d1d1-d1d1-4111-8111-d1d1d1d1d1d1",
                driver_name: "Jane Driver",
                period_start: "2026-10-01",
                period_end: "2026-10-07",
                status: "Approved",
                gross_cents: "550000",
                deductions_cents: "55000",
                advances_cents: "0",
                escrow_withheld_cents: "27500",
                net_cents: "467500",
                load_count: "3",
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

describe("GET /api/v1/reports/driver-settlements", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    await registerDriverSettlementsReportRoutes(app);
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns rows with pagination envelope", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/driver-settlements?operating_company_id=${COMPANY_ID}&from=2026-10-01&to=2026-10-31`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.pagination.total).toBe(1);
    expect(body.pagination.limit).toBe(50);
    expect(body.pagination.offset).toBe(0);
    expect(body.rows).toHaveLength(1);
  });

  it("returns settlement row with money fields", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/driver-settlements?operating_company_id=${COMPANY_ID}&from=2026-10-01&to=2026-10-31`,
    });
    const body = res.json();
    const row = body.rows[0];

    expect(row.settlement_number).toBe("SET-2026-001");
    expect(row.driver_name).toBe("Jane Driver");
    expect(row.gross_cents).toBe(550000);
    expect(row.deductions_cents).toBe(55000);
    expect(row.escrow_withheld_cents).toBe(27500);
    expect(row.net_cents).toBe(467500);
    expect(row.load_count).toBe(3);
  });

  it("returns totals aggregated from rows", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/driver-settlements?operating_company_id=${COMPANY_ID}&from=2026-10-01&to=2026-10-31`,
    });
    const body = res.json();

    expect(body.totals.gross_cents).toBe(550000);
    expect(body.totals.net_cents).toBe(467500);
    expect(body.totals.settlement_count).toBe(1);
  });

  it("returns period metadata", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/driver-settlements?operating_company_id=${COMPANY_ID}&from=2026-10-01&to=2026-10-31`,
    });
    const body = res.json();
    expect(body.period.start).toBe("2026-10-01");
    expect(body.period.end).toBe("2026-10-31");
  });

  it("rejects from > to with 400", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/driver-settlements?operating_company_id=${COMPANY_ID}&from=2026-10-31&to=2026-10-01`,
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects limit > 200 with 400", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/driver-settlements?operating_company_id=${COMPANY_ID}&from=2026-10-01&to=2026-10-31&limit=500`,
    });
    expect(res.statusCode).toBe(400);
  });

  it("accepts driver_id filter", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/driver-settlements?operating_company_id=${COMPANY_ID}&from=2026-10-01&to=2026-10-31&driver_id=d1d1d1d1-d1d1-4111-8111-d1d1d1d1d1d1`,
    });
    expect(res.statusCode).toBe(200);
  });
});
