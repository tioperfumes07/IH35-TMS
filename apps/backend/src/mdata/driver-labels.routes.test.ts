import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerDriverLabelsRoutes } from "./driver-labels.routes.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const DRIVER = "22222222-2222-4222-8222-222222222222";

const { query, assertMembership } = vi.hoisted(() => ({ query: vi.fn(), assertMembership: vi.fn() }));
vi.mock("../auth/db.js", () => ({
  withCurrentUser: vi.fn(async (_userId: string, fn: (client: { query: typeof query }) => Promise<unknown>) => fn({ query })),
}));
vi.mock("../auth/session-middleware.js", () => ({ requireAuth: () => true }));
vi.mock("../_helpers/company-membership-guard.js", () => ({ assertCompanyMembership: assertMembership }));

describe("GET /api/v1/mdata/driver-labels", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    query.mockReset();
    assertMembership.mockReset().mockResolvedValue(undefined);
    query.mockImplementation(async (sql: string) =>
      sql.includes("FROM mdata.drivers")
        ? { rows: [{ id: DRIVER, label: "Archived Driver" }] }
        : { rows: [] },
    );
    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (request) => {
      request.user = { uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "Safety", email: "safety@example.test" };
    });
    await registerDriverLabelsRoutes(app);
    await app.ready();
  });

  afterEach(async () => app.close());

  it("resolves the exact requested FK inside the requested company, including archived rows", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/mdata/driver-labels?operating_company_id=${COMPANY}&ids=${DRIVER}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ labels: [{ id: DRIVER, label: "Archived Driver" }] });
    expect(assertMembership).toHaveBeenCalledWith("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", COMPANY);
    const selectCall = query.mock.calls.find(([sql]) => String(sql).includes("FROM mdata.drivers"));
    expect(String(selectCall?.[0])).toMatch(/d\.operating_company_id = \$1::uuid/);
    expect(String(selectCall?.[0])).toMatch(/label_dca\.driver_id = d\.id/);
    expect(String(selectCall?.[0])).toMatch(/label_dca\.company_id = \$1::uuid/);
    expect(String(selectCall?.[0])).toMatch(/label_dca\.is_authorized = true/);
    expect(String(selectCall?.[0])).toMatch(/label_dca\.deactivated_at IS NULL/);
    expect(String(selectCall?.[0])).toMatch(/d\.id = ANY\(\$2::uuid\[\]\)/);
    expect(String(selectCall?.[0])).not.toMatch(/d\.archived_at/);
    expect(selectCall?.[1]).toEqual([COMPANY, [DRIVER]]);
  });

  it("rejects malformed or empty ID lists before querying", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/mdata/driver-labels?operating_company_id=${COMPANY}&ids=not-a-uuid`,
    });
    expect(response.statusCode).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
});
