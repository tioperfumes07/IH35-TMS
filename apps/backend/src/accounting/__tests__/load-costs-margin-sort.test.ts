import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { registerLoadCostsBoardRoutes } from "../load-costs-board.routes.js";
const { query, scope } = vi.hoisted(() => ({ query: vi.fn(), scope: vi.fn() }));
vi.mock("../../banking/pending-categorization.js", () => ({ countUncategorizedTransactions: async () => 0 }));
vi.mock("../shared.js", async importOriginal => ({
  ...await importOriginal<typeof import("../shared.js")>(),
  currentAuthUser: () => ({ uuid: "66666666-6666-4666-8666-666666666666", role: "Owner" }),
  withCompanyScope: scope,
}));
describe("REG-010/011 distinct margin amount and percentage sort", () => {
  it.each(["asc", "desc"])("accepts percentage %s and sorts the numeric ratio, not cents", async direction => {
    query.mockReset().mockResolvedValue({ rows: [] });
    scope.mockReset().mockImplementation(async (_user, _company, fn) => fn({ query }));
    const app = Fastify();
    await registerLoadCostsBoardRoutes(app);
    try {
      const response = await app.inject(`/api/v1/accounting/load-costs-board?operating_company_id=5c854333-6ea5-4faa-af31-67cb272fef80&load_costs_sort=margin_pct&sort_direction=${direction}`);
      expect(response.statusCode).toBe(200);
      const sql = query.mock.calls[0]?.[0] as string;
      expect(sql).toContain(`::numeric / NULLIF(l.rate_total_cents, 0)) ${direction.toUpperCase()} NULLS LAST`);
      expect(query.mock.calls[0]?.[1]).toContain("5c854333-6ea5-4faa-af31-67cb272fef80");
    } finally { await app.close(); }
  });
});
