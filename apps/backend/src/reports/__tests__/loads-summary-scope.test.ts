/**
 * 443.281-B: Loads summary (group-by) endpoint tie-out test.
 * Verifies: group-by shape, totals sum from rows, 400 on invalid params.
 */
import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerLoadsSummaryRoutes } from "../loads-summary.routes.js";

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
                group_key: "c1c1c1c1-c1c1-4111-8111-c1c1c1c1c1c1",
                group_label: "Acme Freight",
                load_count: "3",
                revenue_cents: "1650000",
                driver_pay_cents: "660000",
                fuel_cents: "165000",
                margin_cents: "825000",
              },
              {
                group_key: "c2c2c2c2-c2c2-4222-8222-c2c2c2c2c2c2",
                group_label: "Beta Logistics",
                load_count: "2",
                revenue_cents: "1100000",
                driver_pay_cents: "440000",
                fuel_cents: "110000",
                margin_cents: "550000",
              },
            ],
          })),
        };
        return fn(client);
      }
    ),
  };
});

describe("GET /api/v1/reports/loads-summary", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    await registerLoadsSummaryRoutes(app);
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns rows with group_key, group_label, and money fields", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/loads-summary?operating_company_id=${COMPANY_ID}&from=2026-10-01&to=2026-10-31&group_by=customer`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.rows).toHaveLength(2);
    expect(body.rows[0].group_label).toBe("Acme Freight");
    expect(body.rows[0].load_count).toBe(3);
    expect(body.rows[0].revenue_cents).toBe(1650000);
    expect(body.rows[0].margin_cents).toBe(825000);
  });

  it("returns totals that match sum of rows", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/loads-summary?operating_company_id=${COMPANY_ID}&from=2026-10-01&to=2026-10-31&group_by=customer`,
    });
    const body = res.json();

    const rowRevSum = body.rows.reduce((s: number, r: any) => s + r.revenue_cents, 0);
    expect(body.totals.revenue_cents).toBe(rowRevSum);
    expect(body.totals.load_count).toBe(5);
  });

  it("returns margin_pct for non-zero revenue rows", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/loads-summary?operating_company_id=${COMPANY_ID}&from=2026-10-01&to=2026-10-31&group_by=customer`,
    });
    const body = res.json();
    expect(body.rows[0].margin_pct).toBeCloseTo(50, 0);
  });

  it("returns group_by and period metadata", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/loads-summary?operating_company_id=${COMPANY_ID}&from=2026-10-01&to=2026-10-31&group_by=driver`,
    });
    const body = res.json();
    expect(body.group_by).toBe("driver");
    expect(body.period.start).toBe("2026-10-01");
    expect(body.period.end).toBe("2026-10-31");
    expect(body.date_field).toBe("pickup");
  });

  it("rejects from > to with 400", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/loads-summary?operating_company_id=${COMPANY_ID}&from=2026-10-31&to=2026-10-01&group_by=customer`,
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects missing group_by with 400", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/loads-summary?operating_company_id=${COMPANY_ID}&from=2026-10-01&to=2026-10-31`,
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects invalid group_by value with 400", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/loads-summary?operating_company_id=${COMPANY_ID}&from=2026-10-01&to=2026-10-31&group_by=invoice`,
    });
    expect(res.statusCode).toBe(400);
  });

  it("accepts delivery date_field", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/loads-summary?operating_company_id=${COMPANY_ID}&from=2026-10-01&to=2026-10-31&group_by=month&date_field=delivery`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.date_field).toBe("delivery");
  });
});

// 443.286-A tie-out: guard that LOADS_REPORT_SCOPE_SQL excludes voided/draft/cancelled loads
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
describe("TIEOUT: loads-summary SQL scope", () => {
  it("imports LOADS_REPORT_SCOPE_SQL which excludes voided and cancelled loads", () => {
    const svc = readFileSync(
      fileURLToPath(new URL("../loads-summary.service.ts", import.meta.url)),
      "utf-8"
    );
    expect(svc).toContain("LOADS_REPORT_SCOPE_SQL");
    // Canonical scope array lives in loads-report.service.ts
    const scope = readFileSync(
      fileURLToPath(new URL("../loads-report.service.ts", import.meta.url)),
      "utf-8"
    );
    expect(scope).toContain("voided_at IS NULL");
    expect(scope).toContain("cancelled");
    expect(scope).toContain("draft");
  });
});
