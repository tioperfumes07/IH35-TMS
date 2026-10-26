/**
 * 443.281-B: Customer report endpoint tie-out test.
 * Verifies: pagination, row shape, outstanding AR, totals, 400s.
 */
import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerCustomerReportRoutes } from "../customer-report.routes.js";

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
                customer_id: "c1c1c1c1-c1c1-4111-8111-c1c1c1c1c1c1",
                customer_name: "Acme Freight",
                load_count: "5",
                revenue_cents: "2750000",
                driver_pay_cents: "1100000",
                fuel_cents: "275000",
                margin_cents: "1375000",
                invoice_count: "5",
                outstanding_ar_cents: "550000",
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

describe("GET /api/v1/reports/customer-report", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    await registerCustomerReportRoutes(app);
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns rows with pagination envelope", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/customer-report?operating_company_id=${COMPANY_ID}&from=2026-10-01&to=2026-10-31`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pagination.total).toBe(1);
    expect(body.rows).toHaveLength(1);
  });

  it("returns customer row with revenue, AR, margin fields", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/customer-report?operating_company_id=${COMPANY_ID}&from=2026-10-01&to=2026-10-31`,
    });
    const body = res.json();
    const row = body.rows[0];

    expect(row.customer_name).toBe("Acme Freight");
    expect(row.load_count).toBe(5);
    expect(row.revenue_cents).toBe(2750000);
    expect(row.outstanding_ar_cents).toBe(550000);
    expect(row.margin_cents).toBe(1375000);
    expect(row.margin_pct).toBeCloseTo(50, 0);
    expect(row.invoice_count).toBe(5);
  });

  it("returns totals aggregated from rows", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/customer-report?operating_company_id=${COMPANY_ID}&from=2026-10-01&to=2026-10-31`,
    });
    const body = res.json();
    expect(body.totals.revenue_cents).toBe(2750000);
    expect(body.totals.outstanding_ar_cents).toBe(550000);
    expect(body.totals.customer_count).toBe(1);
  });

  it("returns period and date_field metadata", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/customer-report?operating_company_id=${COMPANY_ID}&from=2026-10-01&to=2026-10-31`,
    });
    const body = res.json();
    expect(body.period.start).toBe("2026-10-01");
    expect(body.date_field).toBe("pickup");
  });

  it("rejects from > to with 400", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/customer-report?operating_company_id=${COMPANY_ID}&from=2026-10-31&to=2026-10-01`,
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects limit > 200 with 400", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/customer-report?operating_company_id=${COMPANY_ID}&from=2026-10-01&to=2026-10-31&limit=500`,
    });
    expect(res.statusCode).toBe(400);
  });

  it("accepts delivery date_field", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/customer-report?operating_company_id=${COMPANY_ID}&from=2026-10-01&to=2026-10-31&date_field=delivery`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().date_field).toBe("delivery");
  });
});

// 443.286-A tie-out: guard that outstanding_ar_cents excludes proforma/voided invoices
// GL 1100 target = $621,076.72 (issued invoices only; proforma INV-169/13690 $3,000 excluded)
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { expandLivePredicates } from "./expand-live-predicates.js";
describe("TIEOUT: customer-report outstanding AR excludes proforma", () => {
  it("service SQL has proforma and status NOT IN exclusion on invoices", () => {
    const src = expandLivePredicates(readFileSync(
      fileURLToPath(new URL("../customer-report.service.ts", import.meta.url)),
      "utf-8"
    ));
    expect(src).toContain("proforma");
    expect(src).toContain("status NOT IN");
    // Canonical set mirrors ar-aging.service.ts
    expect(src).toContain("factored");
  });
});
