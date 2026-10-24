/**
 * 443.281-B: Loads history endpoint tie-out test.
 * Verifies: pagination shape, totals aggregation, AR 1100 tie-out field presence.
 */
import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerLoadsHistoryRoutes } from "../loads-history.routes.js";

const COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

// Each call to client.query returns a different result based on call order:
//  call 0: paged rows (with _total_count window)
//  call 1: totals + AR tie-out aggregate
let queryCallCount = 0;

vi.mock("../shared.js", async () => {
  const actual = await vi.importActual<typeof import("../shared.js")>("../shared.js");
  return {
    ...actual,
    currentAuthUser: vi.fn(() => ({ uuid: USER_ID, role: "Owner" })),
    withCompanyScope: vi.fn(
      async (_userId: string, _companyId: string, fn: (client: any) => Promise<any>) => {
        queryCallCount = 0;
        const client = {
          query: vi.fn(async () => {
            const call = queryCallCount++;
            if (call === 0) {
              // Paged rows query
              return {
                rows: [
                  {
                    load_id: "11111111-1111-4111-8111-111111111111",
                    load_number: "LD-001",
                    status: "Delivered",
                    trip_type: "NB",
                    customer_id: "c1c1c1c1-c1c1-4111-8111-c1c1c1c1c1c1",
                    customer_name: "Acme Freight",
                    driver_id: "d1d1d1d1-d1d1-4111-8111-d1d1d1d1d1d1",
                    driver_name: "Jane Driver",
                    unit_id: "u1u1u1u1-u1u1-4111-8111-u1u1u1u1u1u1",
                    unit_number: "TRK-101",
                    lc_unit_number: "TRK-101",
                    trailer_id: null,
                    trailer_number: null,
                    customer_po_number: "PO-999",
                    customer_wo_number: null,
                    origin_city: "Laredo",
                    origin_state: "TX",
                    destination_city: "San Antonio",
                    destination_state: "TX",
                    pickup_date: "2026-10-01",
                    delivery_date: "2026-10-02",
                    miles_practical: "150",
                    miles_shortest: "145",
                    miles_driven_actual: "152",
                    invoice_id: "i1i1i1i1-i1i1-4111-8111-i1i1i1i1i1i1",
                    invoice_number: "INV-2026-001",
                    factoring_advance_id: null,
                    factoring_display: null,
                    factoring_status: null,
                    lc_revenue_cents: "550000",
                    lc_driver_pay_cents: "220000",
                    lc_fuel_cents: "55000",
                    lc_margin_cents: "275000",
                    lc_settlement_number: "SET-001",
                    lc_settlement_id: "s1s1s1s1-s1s1-4111-8111-s1s1s1s1s1s1",
                    _total_count: "1",
                  },
                ],
              };
            }
            // Totals + AR tie-out query
            return {
              rows: [
                {
                  load_count: "1",
                  revenue_cents: "550000",
                  driver_pay_cents: "220000",
                  fuel_cents: "55000",
                  margin_cents: "275000",
                  ar_invoice_count: "1",
                  ar_invoice_amount_cents: "550000",
                },
              ],
            };
          }),
        };
        return fn(client);
      }
    ),
  };
});

describe("GET /api/v1/reports/loads-history", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    await registerLoadsHistoryRoutes(app);
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns paged rows with pagination envelope", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/loads-history?operating_company_id=${COMPANY_ID}&from=2026-10-01&to=2026-10-31`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    // Pagination envelope
    expect(body.pagination).toBeDefined();
    expect(body.pagination.limit).toBe(50);
    expect(body.pagination.offset).toBe(0);
    expect(body.pagination.total).toBe(1);

    // Rows
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].load_number).toBe("LD-001");
    expect(body.rows[0].revenue_cents).toBe(550000);
    expect(body.rows[0].driver_pay_cents).toBe(220000);
    expect(body.rows[0].fuel_cents).toBe(55000);
    expect(body.rows[0].margin_cents).toBe(275000);
  });

  it("returns totals block with AR 1100 tie-out", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/loads-history?operating_company_id=${COMPANY_ID}&from=2026-10-01&to=2026-10-31`,
    });
    const body = res.json();

    // Totals
    expect(body.totals.load_count).toBe(1);
    expect(body.totals.revenue_cents).toBe(550000);
    expect(body.totals.driver_pay_cents).toBe(220000);

    // AR 1100 tie-out fields present and non-negative
    expect(typeof body.totals.ar_invoice_count).toBe("number");
    expect(typeof body.totals.ar_invoice_amount_cents).toBe("number");
    expect(body.totals.ar_invoice_count).toBeGreaterThanOrEqual(0);
    expect(body.totals.ar_invoice_amount_cents).toBeGreaterThanOrEqual(0);
  });

  it("returns scope and period metadata", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/loads-history?operating_company_id=${COMPANY_ID}&from=2026-10-01&to=2026-10-31`,
    });
    const body = res.json();
    expect(body.scope).toBe("real_loads_that_happened");
    expect(body.period.start).toBe("2026-10-01");
    expect(body.period.end).toBe("2026-10-31");
    expect(body.date_field).toBe("pickup");
  });

  it("rejects from > to with 400", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/loads-history?operating_company_id=${COMPANY_ID}&from=2026-10-31&to=2026-10-01`,
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects limit > 200 with 400", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/loads-history?operating_company_id=${COMPANY_ID}&from=2026-10-01&to=2026-10-31&limit=500`,
    });
    expect(res.statusCode).toBe(400);
  });

  it("accepts delivery date_field", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/loads-history?operating_company_id=${COMPANY_ID}&from=2026-10-01&to=2026-10-31&date_field=delivery`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.date_field).toBe("delivery");
  });
});
