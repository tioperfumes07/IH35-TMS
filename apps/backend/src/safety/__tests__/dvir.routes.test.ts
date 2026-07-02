import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSafetyDvirRoutes } from "../dvir.routes.js";
import { submitDriverDvir } from "../dvir-submit.service.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";

const { mockQuery, mockWithCurrentUser, mockSubmitDriverDvir } = vi.hoisted(() => {
  const query = vi.fn();
  const withCurrentUser = vi.fn(async (_userId: string, fn: (client: { query: typeof query }) => Promise<unknown>) =>
    fn({ query })
  );
  const submit = vi.fn();
  return { mockQuery: query, mockWithCurrentUser: withCurrentUser, mockSubmitDriverDvir: submit };
});

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: mockWithCurrentUser,
}));

// Cross-tenant guard: exercised in dedicated membership tests; no-op here so route logic (not membership) is under test.
vi.mock("../../_helpers/company-membership-guard.js", () => ({
  assertCompanyMembership: vi.fn(async () => undefined),
}));


vi.mock("../../auth/session-middleware.js", () => ({
  requireAuth: () => true,
}));

vi.mock("../dvir-submit.service.js", async () => {
  const actual = await vi.importActual<typeof import("../dvir-submit.service.js")>("../dvir-submit.service.js");
  return {
    ...actual,
    submitDriverDvir: mockSubmitDriverDvir,
  };
});

function mockDbQuery() {
  return vi.fn(async (sql: string) => {
    if (sql.includes("SET LOCAL app.operating_company_id")) {
      return { rows: [], rowCount: 0 };
    }
    return { rows: [], rowCount: 0 };
  });
}

describe("safety dvir routes (A23-4)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    mockQuery.mockImplementation(mockDbQuery());
    mockSubmitDriverDvir.mockReset();
    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => {
      req.user = {
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "Safety",
        email: "safety@ih35.local",
      };
    });
    await registerSafetyDvirRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /api/v1/safety/dvir lists submissions", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SET LOCAL")) return { rows: [], rowCount: 0 };
      return { rows: [{ id: "dvir-1", submitted_at: "2026-06-03T12:00:00Z" }], rowCount: 1 };
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/safety/dvir?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty("submissions");
    expect(mockQuery).toHaveBeenCalled();
  });

  it("GET /api/v1/safety/dvir/:id returns submission detail", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SET LOCAL")) return { rows: [], rowCount: 0 };
      if (sql.includes("FROM safety.dvir_defects")) {
        return { rows: [{ id: "defect-1", item_key: "brakes" }], rowCount: 1 };
      }
      return { rows: [{ id: "dvir-1", type: "pre_trip" }], rowCount: 1 };
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/safety/dvir/22222222-2222-4222-8222-222222222222?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ submission: { id: "dvir-1" }, defects: [{ id: "defect-1" }] });
  });

  it("GET /api/v1/safety/dvir/:id returns 404 when missing", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SET LOCAL")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/safety/dvir/22222222-2222-4222-8222-222222222222?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(404);
  });

  it("POST /api/v1/safety/dvir rejects without driver profile", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SET LOCAL")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/safety/dvir?operating_company_id=${COMPANY}`,
      payload: {
        load_id: "33333333-3333-4333-8333-333333333333",
        mode: "pre",
        unit: "Unit 1",
        odometer: 100,
        location: "Yard",
        certified_at: "2026-06-03T12:00:00Z",
        signature_data_url: "data:image/png;base64,abc",
        out_of_service: false,
        items: [{ key: "lights", status: "pass", note: "", photo_keys: [] }],
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it("validates list query parameters", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/safety/dvir?operating_company_id=not-a-uuid`,
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("submitDriverDvir service contract", () => {
  it("exports submit helper used by driver and safety routes", () => {
    expect(typeof submitDriverDvir).toBe("function");
  });
});
