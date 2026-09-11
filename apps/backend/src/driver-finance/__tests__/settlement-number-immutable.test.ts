import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { registerDriverFinanceSettlementRoutes } from "../settlements.routes.js";

const { query, membership } = vi.hoisted(() => ({ query: vi.fn(), membership: vi.fn() }));
vi.mock("../../auth/db.js", () => ({
  withCurrentUser: (_id: string, fn: (c: unknown) => unknown) => fn({ query }),
  withLuciaBypass: vi.fn(),
}));
vi.mock("../../_helpers/company-membership-guard.js", () => ({ assertCompanyMembership: membership }));
vi.mock("../../auth/session-middleware.js", () => ({ requireAuth: () => true }));

const company = "5c854333-6ea5-4faa-af31-67cb272fef80";
const settlement = "f2ec92f4-afc2-4152-a744-a43adf1b57ee";
describe("REG-010/011 canonical settlement number is immutable", () => {
  it.each(["S-13734", "5795", "S-2026-9999"])("rejects typed override %s without a write", async (display_id) => {
    query.mockReset().mockImplementation(async (sql: string) => ({ rows: sql.includes("SELECT display_id") ? [{ display_id: "S-2026-0042" }] : [] }));
    membership.mockReset().mockResolvedValue(undefined);
    const app = Fastify();
    app.addHook("preHandler", async req => { req.user = { uuid: "66666666-6666-4666-8666-666666666666", role: "Owner" } as never; });
    await registerDriverFinanceSettlementRoutes(app);
    try {
      const response = await app.inject({ method: "PATCH", url: `/api/v1/driver-finance/settlements/${settlement}/display-id`, payload: { operating_company_id: company, display_id } });
      expect(response.statusCode).toBe(409);
      expect(response.json().error).toBe("settlement_number_is_server_generated");
      expect(membership).toHaveBeenCalledWith("66666666-6666-4666-8666-666666666666", company);
      expect(query.mock.calls.some(([sql]) => /UPDATE|INSERT|DELETE/.test(sql))).toBe(false);
      expect(query.mock.calls.find(([sql]) => sql.includes("SELECT display_id"))?.[1]).toEqual([settlement, company]);
    } finally { await app.close(); }
  });
});
