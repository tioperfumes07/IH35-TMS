import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerCompanyRoutes } from "./companies.routes.js";

// CODER-16 USMCA pre-activation guard: USMCA (5c854333…) must NEVER appear in the company list /
// picker before launch. Even if the DB hands it back (mis-grant / not deactivated), the route must
// filter it out while USMCA_ACTIVE is off. This locks that defense-in-depth so it can't regress.

const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const TRANSP_ID = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";

const { queryMock } = vi.hoisted(() => ({
  // DB intentionally returns USMCA alongside TRANSP — the route must still drop USMCA.
  queryMock: vi.fn(async () => ({
    rows: [
      { id: TRANSP_ID, code: "TRANSP", legal_name: "IH35 Transportation", is_active: true, is_default: true },
      { id: USMCA_ID, code: "USMCA", legal_name: "USMCA Carrier", is_active: true, is_default: false },
    ],
  })),
}));

vi.mock("../auth/session-middleware.js", () => ({
  requireAuth: (req: { user?: unknown }) => {
    (req as { user?: { uuid: string; role: string } }).user = { uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "Owner" };
    return true;
  },
}));
vi.mock("../auth/db.js", () => ({
  withCurrentUser: async (_u: string, fn: (c: { query: typeof queryMock }) => Promise<unknown>) => fn({ query: queryMock }),
}));

const apps: Array<{ close: () => Promise<void> }> = [];
afterEach(async () => {
  for (const a of apps.splice(0)) await a.close();
  vi.clearAllMocks();
  delete process.env.USMCA_ACTIVE;
});

async function build() {
  const app = Fastify();
  apps.push(app);
  await registerCompanyRoutes(app);
  return app;
}

describe("CODER-16 — USMCA hidden from company list until launch", () => {
  it("GET /api/v1/org/me/companies excludes USMCA when USMCA_ACTIVE is off", async () => {
    const app = await build();
    const res = await app.inject({ method: "GET", url: "/api/v1/org/me/companies" });
    expect(res.statusCode).toBe(200);
    const ids = (res.json().companies as Array<{ id: string }>).map((c) => c.id);
    expect(ids).toContain(TRANSP_ID);
    expect(ids).not.toContain(USMCA_ID);
  });

  it("GET /api/v1/org/companies excludes USMCA when USMCA_ACTIVE is off", async () => {
    const app = await build();
    const res = await app.inject({ method: "GET", url: "/api/v1/org/companies" });
    expect(res.statusCode).toBe(200);
    const ids = (res.json().companies as Array<{ id: string }>).map((c) => c.id);
    expect(ids).not.toContain(USMCA_ID);
  });
});
