/**
 * 443.281-B: Vendor AP report endpoint tie-out test.
 * Verifies: pagination, row shape, outstanding AP, totals, 400s.
 */
import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerVendorReportRoutes } from "../vendor-report.routes.js";

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
                vendor_id: "a1a1a1a1-a1a1-4111-8111-a1a1a1a1a1a1",
                vendor_name: "PEMEX Fuel Supplier",
                bill_count: "8",
                total_billed_cents: "880000",
                total_paid_cents: "660000",
                outstanding_ap_cents: "220000",
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

describe("GET /api/v1/reports/vendor-report", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    await registerVendorReportRoutes(app);
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns rows with pagination envelope", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/vendor-report?operating_company_id=${COMPANY_ID}&from=2026-10-01&to=2026-10-31`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pagination.total).toBe(1);
    expect(body.rows).toHaveLength(1);
  });

  it("returns vendor row with AP fields", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/vendor-report?operating_company_id=${COMPANY_ID}&from=2026-10-01&to=2026-10-31`,
    });
    const body = res.json();
    const row = body.rows[0];

    expect(row.vendor_name).toBe("PEMEX Fuel Supplier");
    expect(row.bill_count).toBe(8);
    expect(row.total_billed_cents).toBe(880000);
    expect(row.total_paid_cents).toBe(660000);
    expect(row.outstanding_ap_cents).toBe(220000);
  });

  it("returns totals aggregated from rows", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/vendor-report?operating_company_id=${COMPANY_ID}&from=2026-10-01&to=2026-10-31`,
    });
    const body = res.json();
    expect(body.totals.total_billed_cents).toBe(880000);
    expect(body.totals.outstanding_ap_cents).toBe(220000);
    expect(body.totals.vendor_count).toBe(1);
  });

  it("returns period metadata", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/vendor-report?operating_company_id=${COMPANY_ID}&from=2026-10-01&to=2026-10-31`,
    });
    const body = res.json();
    expect(body.period.start).toBe("2026-10-01");
    expect(body.period.end).toBe("2026-10-31");
  });

  it("rejects from > to with 400", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/vendor-report?operating_company_id=${COMPANY_ID}&from=2026-10-31&to=2026-10-01`,
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects limit > 200 with 400", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/vendor-report?operating_company_id=${COMPANY_ID}&from=2026-10-01&to=2026-10-31&limit=500`,
    });
    expect(res.statusCode).toBe(400);
  });

  it("accepts vendor_id filter", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/vendor-report?operating_company_id=${COMPANY_ID}&from=2026-10-01&to=2026-10-31&vendor_id=a1a1a1a1-a1a1-4111-8111-a1a1a1a1a1a1`,
    });
    expect(res.statusCode).toBe(200);
  });
});
