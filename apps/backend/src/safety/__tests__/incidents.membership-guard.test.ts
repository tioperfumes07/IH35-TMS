import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSafetyIncidentsRoutes } from "../incidents.routes.js";

/**
 * Cross-tenant membership wiring test (USMCA blocker, pass 2).
 *
 * Proves that the hardened local `withCompanyScope` wrapper in incidents.routes.ts
 * actually calls the REAL assertCompanyMembership() before setting the tenant GUC:
 *  - a caller who IS a member of the requested operating_company_id proceeds (not 403);
 *  - a caller who is NOT a member is rejected 403 forbidden_company_membership,
 *    even though the operating_company_id is a syntactically-valid UUID.
 *
 * Unlike the other incidents unit tests, this file does NOT mock the guard helper —
 * it drives the genuine assert by making the mocked withCurrentUser answer the
 * org.user_company_access lookup based on the company the caller belongs to.
 */

const AUTH_USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MEMBER_COMPANY = "11111111-1111-4111-8111-111111111111";
const OTHER_COMPANY = "22222222-2222-4222-8222-222222222222";

const { mockWithCurrentUser } = vi.hoisted(() => {
  const withCurrentUser = vi.fn(
    async (_userId: string, fn: (client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }> }) => Promise<unknown>) =>
      fn({
        query: async (sql: string, values?: unknown[]) => {
          // assertCompanyMembership: membership row exists ONLY for MEMBER_COMPANY.
          if (sql.includes("user_company_access")) {
            const companyId = String(values?.[1] ?? "");
            return companyId === MEMBER_COMPANY
              ? { rows: [{ ok: 1 }], rowCount: 1 }
              : { rows: [], rowCount: 0 };
          }
          // GUC set + any incidents list query: return empty result set.
          return { rows: [], rowCount: 0 };
        },
      })
  );
  return { mockWithCurrentUser: withCurrentUser };
});

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: mockWithCurrentUser,
}));

vi.mock("../../auth/session-middleware.js", () => ({
  requireAuth: () => true,
}));

vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn(async () => undefined),
}));

describe("safety incidents routes — cross-tenant membership guard", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => {
      req.user = { uuid: AUTH_USER, role: "Safety", email: "safety@ih35.local" };
    });
    await registerSafetyIncidentsRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("allows a caller who is a member of the requested operating company", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/safety/incidents?operating_company_id=${MEMBER_COMPANY}&incident_type=damage_report`,
    });
    expect(res.statusCode).not.toBe(403);
    expect(res.statusCode).toBe(200);
  });

  it("rejects a cross-tenant caller with 403 forbidden_company_membership", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/safety/incidents?operating_company_id=${OTHER_COMPANY}&incident_type=damage_report`,
    });
    expect(res.statusCode).toBe(403);
  });
});
