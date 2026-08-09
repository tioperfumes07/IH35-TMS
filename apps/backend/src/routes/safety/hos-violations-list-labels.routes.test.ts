import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSafetyHosViolationsRoutes } from "./hos-violations.js";

/**
 * CLS-UUID-LABEL: GET /api/v1/safety/hos-violations `SELECT *` had no driver join —
 * HOSViolationsTab's EntityLink reads row.driver_name (always undefined), so it rendered the raw
 * driver_id uuid. Mirrors the driver-join pattern already used on
 * accidents/dot_inspections/internal_fines/training_records.
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

  it("returns driver_name and the SQL LEFT JOINs mdata.drivers", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/safety/hos-violations?operating_company_id=${COMPANY}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      hos_violations: [{ id: "violation-1", driver_name: "Tomas Reyes" }],
    });

    const sqlText = mockQuery.mock.calls.map((call) => String(call[0])).join("\n");
    expect(sqlText).toMatch(/LEFT JOIN mdata\.drivers d/);
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
});
