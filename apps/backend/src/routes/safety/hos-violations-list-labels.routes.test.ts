import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSafetyHosViolationsRoutes } from "./hos-violations.js";

/**
 * CLS-UUID-LABEL / LINK-F5169: the HOS list must resolve both canonical FK identities. Without the
 * scoped driver/load joins, EntityLink would either render a UUID fallback or have no load label.
 */

const COMPANY = "11111111-1111-4111-8111-111111111111";

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: vi.fn(async (_userId: string, fn: (client: { query: typeof mockQuery }) => Promise<unknown>) =>
    fn({ query: mockQuery })
  ),
}));
vi.mock("../../auth/session-middleware.js", () => ({ requireAuth: () => true }));
vi.mock("../../_helpers/company-membership-guard.js", () => ({
  assertCompanyMembership: vi.fn(async () => undefined),
}));

describe("GET /api/v1/safety/hos-violations joins the driver name", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [], rowCount: 0 };
      if (sql.includes("FROM safety.hos_violations hv")) {
        return {
          rows: [
            {
              id: "violation-1",
              driver_id: "driver-1",
              driver_name: "Tomas Reyes",
              related_load_id: "load-1",
              related_load_number: "L-1001",
              violation_type: "11_hour_driving",
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });
    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => {
      req.user = { uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "Safety", email: "safety@ih35.local" };
    });
    await registerSafetyHosViolationsRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns driver/load labels and company-scopes both joins", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/safety/hos-violations?operating_company_id=${COMPANY}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      hos_violations: [{ id: "violation-1", driver_name: "Tomas Reyes", related_load_number: "L-1001" }],
    });

    const sqlText = mockQuery.mock.calls.map((call) => String(call[0])).join("\n");
    expect(sqlText).toMatch(/LEFT JOIN mdata\.drivers d/);
    expect(sqlText).toMatch(/LEFT JOIN mdata\.loads l/);
    expect(sqlText).toMatch(/l\.operating_company_id = hv\.operating_company_id/);
  });

  it("still scopes by operating_company_id and voided_at when a driver_id filter is applied", async () => {
    const driverId = "22222222-2222-4222-8222-222222222222";
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/safety/hos-violations?operating_company_id=${COMPANY}&driver_id=${driverId}`,
    });

    expect(response.statusCode).toBe(200);
    const sqlText = mockQuery.mock.calls.map((call) => String(call[0])).join("\n");
    expect(sqlText).toMatch(/hv\.operating_company_id = \$1/);
    expect(sqlText).toMatch(/hv\.voided_at IS NULL/);
    expect(sqlText).toMatch(/hv\.driver_id = \$2/);
  });

  it("creates only after every submitted linkage is validated in the selected company", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [], rowCount: 0 };
      if (sql.includes("AS driver_ok")) {
        return { rows: [{ driver_ok: true, violation_type_ok: true, load_ok: true, dot_inspection_ok: true }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO safety.hos_violations")) {
        return { rows: [{ id: "55555555-5555-4555-8555-555555555555", violation_type: "395.3", source: "manual_office" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/safety/hos-violations?operating_company_id=${COMPANY}`,
      payload: {
        driver_id: "22222222-2222-4222-8222-222222222222",
        violation_type: "395.3",
        dot_violation_type_id: "33333333-3333-4333-8333-333333333333",
        occurred_at: "2026-08-12T12:00:00.000Z",
        source: "manual_office",
        related_load_id: "44444444-4444-4444-8444-444444444444",
      },
    });

    expect(response.statusCode).toBe(201);
    const validationCall = mockQuery.mock.calls.find((call) => String(call[0]).includes("AS driver_ok"));
    expect(validationCall?.[1]).toEqual([
      COMPANY,
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
      "395.3",
      "44444444-4444-4444-8444-444444444444",
      null,
    ]);
  });

  it("rejects a cross-company driver before the insert", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [], rowCount: 0 };
      if (sql.includes("AS driver_ok")) {
        return { rows: [{ driver_ok: false, violation_type_ok: true, load_ok: true, dot_inspection_ok: true }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/safety/hos-violations?operating_company_id=${COMPANY}`,
      payload: {
        driver_id: "22222222-2222-4222-8222-222222222222",
        violation_type: "395.3",
        dot_violation_type_id: "33333333-3333-4333-8333-333333333333",
        occurred_at: "2026-08-12T12:00:00.000Z",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "linked_entity_not_in_operating_company" });
    expect(mockQuery.mock.calls.some((call) => String(call[0]).includes("INSERT INTO safety.hos_violations"))).toBe(false);
  });
});
