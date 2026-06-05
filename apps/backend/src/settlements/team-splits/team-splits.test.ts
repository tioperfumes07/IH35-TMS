import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTeamSplitsForSettlement } from "./apply.js";
import { registerTeamSplitRoutes } from "./team-splits.routes.js";

const queryMock = vi.hoisted(() => vi.fn());

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
    fn({ query: queryMock }),
}));

vi.mock("../../accounting/shared.js", () => {
  const companyQuerySchema = {
    safeParse: (value: unknown) => {
      const data = value as { operating_company_id?: string };
      if (data?.operating_company_id) return { success: true as const, data: { operating_company_id: data.operating_company_id } };
      return { success: false as const, error: { flatten: () => ({}) } };
    },
    extend: () => ({
      safeParse: (value: unknown) => {
        const data = value as Record<string, unknown>;
        if (data?.operating_company_id) return { success: true as const, data };
        return { success: false as const, error: { flatten: () => ({}) } };
      },
    }),
  };
  return {
    companyQuerySchema,
    currentAuthUser: () => ({ uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
    validationError: () => ({ error: "validation_error" }),
    withCompanyScope: async (_userId: string, _companyId: string, fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
      fn({ query: queryMock }),
  };
});

vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn(),
}));

describe("team split commission (CLOSURE-6)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    queryMock.mockReset();
    app = Fastify({ logger: false });
    await registerTeamSplitRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("creates 60/40 team split config", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT INTO settlements.team_split_configs")) {
        return {
          rows: [
            {
              id: "config-1",
              primary_driver_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              secondary_driver_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
              primary_ratio: 0.6,
              secondary_ratio: 0.4,
              status: "active",
            },
          ],
        };
      }
      return { rows: [] };
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/team-splits/configs?operating_company_id=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      payload: {
        primary_driver_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        secondary_driver_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        primary_ratio: 0.6,
        secondary_ratio: 0.4,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as { config: { status: string; primary_ratio: number } };
    expect(body.config.status).toBe("active");
    expect(Number(body.config.primary_ratio)).toBeCloseTo(0.6);
  });

  it("applies 60/40 team_split lines for shared load", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("to_regclass")) return { rows: [{ ok: false }] };
      if (sql.includes("FROM settlements.team_split_load_overrides")) return { rows: [] };
      if (sql.includes("FROM settlements.team_split_configs")) {
        return {
          rows: [
            {
              id: "config-1",
              primary_driver_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              secondary_driver_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
              primary_ratio: 0.6,
              secondary_ratio: 0.4,
            },
          ],
        };
      }
      if (sql.includes("INSERT INTO payroll.driver_settlement_line_items")) return { rows: [] };
      return { rows: [] };
    });

    const result = await applyTeamSplitsForSettlement(
      { query: queryMock },
      {
        operatingCompanyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        settlementId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        loadId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        assignedDriverId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        grossAmountCents: 100000,
        loadNumber: "L-9001",
      }
    );

    expect(result.total_split_cents).toBe(100000);
    expect(result.applied).toHaveLength(2);
    expect(result.applied[0]?.line_type).toBe("team_split_primary");
    expect(result.applied[0]?.amount_cents).toBe(60000);
    expect(result.applied[1]?.line_type).toBe("team_split_secondary");
    expect(result.applied[1]?.amount_cents).toBe(40000);
  });
});
