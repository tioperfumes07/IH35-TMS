import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSafetyV5Routes } from "../safety-v5.routes.js";

/**
 * CLS-UUID-LABEL: GET /api/v1/safety/internal-fines never joined the driver, so
 * InternalFinesPage's EntityLink rendered f.driver_id as a raw full uuid with no label prop —
 * same class as CLS-DOT-INSPECTIONS-UUID-LABEL. Mirrors the driver join already used by
 * safety.accident_reports / safety.dot_inspections.
 */

const COMPANY = "11111111-1111-4111-8111-111111111111";

const { mockQuery, mockWithCurrentUser, mockAssertMembership } = vi.hoisted(() => {
  const query = vi.fn();
  const withCurrentUser = vi.fn(async (_userId: string, fn: (client: { query: typeof query }) => Promise<unknown>) =>
    fn({ query })
  );
  const assertCompanyMembership = vi.fn(async () => undefined);
  return { mockQuery: query, mockWithCurrentUser: withCurrentUser, mockAssertMembership: assertCompanyMembership };
});

vi.mock("../../auth/db.js", () => ({ withCurrentUser: mockWithCurrentUser }));
vi.mock("../../_helpers/company-membership-guard.js", () => ({ assertCompanyMembership: mockAssertMembership }));
vi.mock("../../auth/session-middleware.js", () => ({ requireAuth: () => true }));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async () => undefined) }));
vi.mock("../../maintenance/two-section-service.js", () => ({
  createWorkOrderWithLines: vi.fn(async () => ({ woUuid: "wo", display_id: "WO-x", classHint: "x" })),
}));

describe("GET /api/v1/safety/internal-fines joins the driver name", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [], rowCount: 0 };
      if (sql.includes("FROM safety.internal_fines f")) {
        return {
          rows: [
            {
              id: "fine-1",
              driver_id: "driver-1",
              driver_name: "Marcus Reed",
              reason_code: "LOG_ENTRY",
              amount: 25,
              status: "pending",
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
    await registerSafetyV5Routes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns driver_name and the SQL LEFT JOINs mdata.drivers", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/safety/internal-fines?operating_company_id=${COMPANY}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      fines: [{ id: "fine-1", driver_name: "Marcus Reed" }],
    });

    const sqlText = mockQuery.mock.calls.map((call) => String(call[0])).join("\n");
    expect(sqlText).toMatch(/LEFT JOIN mdata\.drivers d/);
  });
});
