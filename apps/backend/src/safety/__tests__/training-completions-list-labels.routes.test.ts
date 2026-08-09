import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSafetyRoutes } from "../safety.routes.js";

/**
 * CLS-UUID-LABEL: GET /api/v1/safety/training/completions never joined the driver —
 * TrainingRecordsPage's EntityLink rendered tr.driver_id as a raw full uuid with no label prop
 * (same class fixed on accidents/dot_inspections/internal_fines).
 */

const COMPANY = "11111111-1111-4111-8111-111111111111";

const { mockQuery, mockWithCurrentUser } = vi.hoisted(() => {
  const query = vi.fn();
  const withCurrentUser = vi.fn(async (_userId: string, fn: (client: { query: typeof query }) => Promise<unknown>) =>
    fn({ query })
  );
  return { mockQuery: query, mockWithCurrentUser: withCurrentUser };
});

vi.mock("../../auth/db.js", () => ({ withCurrentUser: mockWithCurrentUser }));
vi.mock("../../auth/session-middleware.js", () => ({ requireAuth: () => true }));
vi.mock("../../_helpers/company-membership-guard.js", () => ({ assertCompanyMembership: vi.fn(async () => undefined) }));
vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn(async () => undefined),
  buildPatchChanges: vi.fn(() => ({})),
}));
vi.mock("../safety.service.js", () => ({ listSafetyEvents: vi.fn(async () => ({ events: [] })) }));

describe("GET /api/v1/safety/training/completions joins the driver name", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    mockWithCurrentUser.mockClear();
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM safety.training_records tr")) {
        return {
          rows: [
            {
              id: "record-1",
              driver_id: "driver-1",
              driver_name: "Alicia Vance",
              training_name: "Hazmat refresher",
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
    await registerSafetyRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns driver_name and the SQL LEFT JOINs mdata.drivers", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/safety/training/completions?operating_company_id=${COMPANY}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      training_completions: [{ id: "record-1", driver_name: "Alicia Vance" }],
    });

    const sqlText = mockQuery.mock.calls.map((call) => String(call[0])).join("\n");
    expect(sqlText).toMatch(/LEFT JOIN mdata\.drivers d/);
  });
});
