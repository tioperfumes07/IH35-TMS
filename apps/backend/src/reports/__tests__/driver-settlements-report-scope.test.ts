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

// 443.286-A tie-out: guard that driver-settlements SQL excludes voided settlements
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { expandLivePredicates } from "./expand-live-predicates.js";
describe("TIEOUT: driver-settlements SQL scope", () => {
  it("service SQL excludes voided driver settlements", () => {
    const src = expandLivePredicates(readFileSync(
      fileURLToPath(new URL("../driver-settlements-report.service.ts", import.meta.url)),
      "utf-8"
    ));
    expect(src).toContain("voided_at IS NULL");
  });
});

// Rows 80 (11-03 register) — Reports › Driver settlement report board: multi-select driver / status, paid filter,
// cancelled excluded, whole-set totals and the paid / load-range fields the board renders.
import { getDriversSettlementsReport } from "../driver-settlements-report.service.js";

describe("driver settlements report — board fields (row 80)", () => {
  function fakeClient(rows: Array<Record<string, unknown>>) {
    const calls: Array<{ sql: string; values: unknown[] }> = [];
    return {
      calls,
      client: { query: vi.fn(async (sql: string, values: unknown[]) => (calls.push({ sql, values }), { rows })) } as any,
    };
  }

  it("binds multi driver ids / statuses as arrays, filters paid, excludes cancelled", async () => {
    const { client, calls } = fakeClient([]);
    await getDriversSettlementsReport(client, {
      operatingCompanyId: COMPANY_ID,
      from: "2026-01-01",
      to: "2026-11-03",
      driverId: "d1d1d1d1-d1d1-4111-8111-d1d1d1d1d1d1,d2d2d2d2-d2d2-4222-8222-d2d2d2d2d2d2",
      status: "open,closed",
      paid: "unpaid",
      limit: 200,
      offset: 0,
    });
    const { sql, values } = calls[0];
    expect(sql).toContain("s.driver_id = ANY(");
    expect(sql).toContain("s.status::text = ANY(");
    expect(sql).toContain("COALESCE(s.payment_sent_at, s.paid_at) IS NULL");
    expect(sql).toContain("s.status <> 'cancelled'");
    expect(values).toContainEqual(["d1d1d1d1-d1d1-4111-8111-d1d1d1d1d1d1", "d2d2d2d2-d2d2-4222-8222-d2d2d2d2d2d2"]);
    expect(values).toContainEqual(["open", "closed"]);
  });

  it("totals the whole filtered set (window sums), not one page; maps paid / load range", async () => {
    const { client } = fakeClient([
      {
        settlement_id: "s1", display_id: "P-0119", settlement_number: null, driver_id: "d1", driver_name: "A B",
        period_start: "2026-10-21", period_end: "2026-10-23", status: "closed", gross_cents: "49280", deductions_cents: "3500",
        advances_cents: "0", escrow_withheld_cents: "0", net_cents: "45780", load_count: "1", first_load_number: "13697",
        last_load_number: "13697", first_load_id: "l1", last_load_id: "l1", paid_at: null, _total_count: "92",
        _total_gross_cents: "13989849", _total_deductions_cents: "747821", _total_advances_cents: "225568", _total_net_cents: "13467596",
      },
    ]);
    const out = await getDriversSettlementsReport(client, { operatingCompanyId: COMPANY_ID, from: "2026-01-01", to: "2026-11-03", limit: 1, offset: 0 });
    expect(out.totals).toMatchObject({ settlement_count: 92, gross_cents: 13989849, deductions_cents: 747821, advances_cents: 225568, net_cents: 13467596 });
    expect(out.rows[0]).toMatchObject({ display_id: "P-0119", first_load_number: "13697", paid_at: null });
  });

  it("rejects a non-uuid driver id in the multi filter", async () => {
    const app = Fastify();
    await registerDriverSettlementsReportRoutes(app);
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/reports/driver-settlements?operating_company_id=${COMPANY_ID}&from=2026-10-01&to=2026-10-31&driver_id=abc,def`,
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
