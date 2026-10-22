// LEAD 443.217 — owner 10-21: "find the root cause of the cancelled loads engine and fix permanently". Live: the Load Costs
// board asked show_voided=false and got the cancelled loads 13635 / 13634 / 13593 / 13556, because z.coerce.boolean() made
// the string "false" TRUE. On main this test fails: "false" builds the same SQL as "true".
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { registerLoadCostsBoardRoutes } from "../load-costs-board.routes.js";
const { query, scope } = vi.hoisted(() => ({ query: vi.fn(), scope: vi.fn() }));
vi.mock("../../banking/pending-categorization.js", () => ({ countUncategorizedTransactions: async () => 0 }));
vi.mock("../shared.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../shared.js")>()),
  currentAuthUser: () => ({ uuid: "66666666-6666-4666-8666-666666666666", role: "Owner" }),
  withCompanyScope: scope,
}));

const CO = "5c854333-6ea5-4faa-af31-67cb272fef80";
async function boardSql(extra: string): Promise<{ status: number; sql: string }> {
  query.mockReset().mockResolvedValue({ rows: [] });
  scope.mockReset().mockImplementation(async (_u: unknown, _c: unknown, fn: (c: unknown) => unknown) => fn({ query }));
  const app = Fastify();
  await registerLoadCostsBoardRoutes(app);
  try {
    const r = await app.inject(`/api/v1/accounting/load-costs-board?operating_company_id=${CO}${extra}`);
    return { status: r.statusCode, sql: String(query.mock.calls[0]?.[0] ?? "") };
  } finally {
    await app.close();
  }
}

describe("443.217 — show_voided=false hides cancelled / voided loads", () => {
  it('"false" is false: the same SQL as the default (voided hidden), not the show-voided SQL', async () => {
    const dflt = await boardSql("");
    const off = await boardSql("&show_voided=false");
    const on = await boardSql("&show_voided=true");
    expect(off.status).toBe(200);
    expect(off.sql).toBe(dflt.sql);
    expect(on.sql).not.toBe(off.sql);
  });
  it('"0" is false and "1" is true; a non-boolean is a 400, never guessed', async () => {
    expect((await boardSql("&show_voided=0")).sql).toBe((await boardSql("")).sql);
    expect((await boardSql("&show_voided=1")).sql).toBe((await boardSql("&show_voided=true")).sql);
    expect((await boardSql("&show_voided=yes")).status).toBe(400);
  });
});
