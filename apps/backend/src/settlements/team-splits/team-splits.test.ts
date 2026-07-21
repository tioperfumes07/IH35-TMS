/**
 * P2b/P2f team-split convergence (owner ruling DECISION 2, Option A — 2026-07-21).
 * Pins: facade CRUD lands on mdata.driver_teams (via canonical createTeam/deactivateTeam),
 * resolver reads mdata.driver_teams, per-load override path reads mdata.loads override columns,
 * override writes respect the posted-split immutability latch, and the module contains ZERO
 * RETIRE-table SQL (settlements.team_split_configs / settlements.team_split_load_overrides).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTeamSplitsForSettlement, resolveTeamSplitForLoad } from "./apply.js";
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
    currentAuthUser: () => ({ uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "Owner" }),
    validationError: (reply: { code: (n: number) => { send: (b: unknown) => unknown } }) =>
      reply.code(400).send({ error: "validation_error" }),
    withCompanyScope: async (_userId: string, _companyId: string, fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
      fn({ query: queryMock }),
  };
});

vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn(),
}));

const COMPANY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PRIMARY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SECONDARY = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const LOAD = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const SETTLEMENT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const TEAM_ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  operating_company_id: COMPANY,
  team_name: "Perez / Garza",
  primary_driver_id: PRIMARY,
  secondary_driver_id: SECONDARY,
  split_method: "60_40",
  primary_share_pct: 60,
  co_share_pct: 40,
  is_active: true,
  effective_from: "2026-07-21",
  effective_to: null,
  notes: null,
  created_at: "2026-07-21T00:00:00Z",
};

describe("team splits facade over mdata.driver_teams (P2b convergence)", () => {
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

  it("creates a 60/40 config as a canonical mdata.driver_teams row", async () => {
    let insertedTeamSql: string | null = null;
    let insertedTeamValues: unknown[] | undefined;
    queryMock.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql.includes("id = ANY($1::uuid[])")) {
        return {
          rows: [
            { id: PRIMARY, driver_name: "Perez Mecor" },
            { id: SECONDARY, driver_name: "Garza Luis" },
          ],
        };
      }
      if (sql.includes("FROM mdata.drivers d")) return { rows: [{ id: PRIMARY }] }; // assertDriverCompany
      if (sql.includes("INSERT INTO mdata.driver_teams")) {
        insertedTeamSql = sql;
        insertedTeamValues = values;
        return { rows: [TEAM_ROW] };
      }
      if (sql.includes("FROM mdata.driver_teams")) return { rows: [] }; // assertNotInOtherActiveTeam
      return { rows: [] };
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/team-splits/configs?operating_company_id=${COMPANY}`,
      payload: {
        primary_driver_id: PRIMARY,
        secondary_driver_id: SECONDARY,
        primary_ratio: 0.6,
        secondary_ratio: 0.4,
      },
    });

    expect(res.statusCode).toBe(201);
    expect(insertedTeamSql).toContain("INSERT INTO mdata.driver_teams");
    expect(insertedTeamValues).toContain("60_40");
    const body = res.json() as { config: { status: string; primary_ratio: number; split_type: string; split_method: string } };
    expect(body.config.status).toBe("active");
    expect(Number(body.config.primary_ratio)).toBeCloseTo(0.6);
    expect(body.config.split_type).toBe("percentage");
    expect(body.config.split_method).toBe("60_40");
  });

  it("lists configs read from mdata.driver_teams", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM mdata.driver_teams t")) {
        return { rows: [{ ...TEAM_ROW, primary_driver_name: "Perez Mecor", secondary_driver_name: "Garza Luis" }] };
      }
      return { rows: [] };
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/team-splits/configs?operating_company_id=${COMPANY}&status=active`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { configs: Array<{ id: string; status: string; primary_ratio: number; secondary_ratio: number }> };
    expect(body.configs).toHaveLength(1);
    expect(body.configs[0]?.id).toBe(TEAM_ROW.id);
    expect(body.configs[0]?.status).toBe("active");
    expect(Number(body.configs[0]?.primary_ratio)).toBeCloseTo(0.6);
    expect(Number(body.configs[0]?.secondary_ratio)).toBeCloseTo(0.4);
  });

  it("ends a config by deactivating the canonical team row", async () => {
    let deactivateSql: string | null = null;
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("UPDATE mdata.driver_teams")) {
        deactivateSql = sql;
        return { rows: [{ ...TEAM_ROW, is_active: false, effective_to: "2026-07-21" }] };
      }
      if (sql.includes("FROM mdata.driver_teams")) return { rows: [TEAM_ROW] }; // getTeam
      if (sql.includes("FROM mdata.loads")) return { rows: [] }; // no in-progress loads
      return { rows: [] };
    });

    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/team-splits/configs/${TEAM_ROW.id}?operating_company_id=${COMPANY}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(deactivateSql).toContain("is_active = false");
  });

  it("writes the per-load override onto mdata.loads and blocks posted-split overrides", async () => {
    let overrideUpdateSql: string | null = null;
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM driver_finance.team_settlement_splits")) return { rows: [] };
      if (sql.includes("UPDATE mdata.loads")) {
        overrideUpdateSql = sql;
        return {
          rows: [
            {
              load_id: LOAD,
              operating_company_id: COMPANY,
              primary_driver_id: PRIMARY,
              secondary_driver_id: SECONDARY,
              primary_ratio: 0.7,
              secondary_ratio: 0.3,
              reason: "one_off_team",
              created_by_user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              set_at: "2026-07-21T00:00:00Z",
            },
          ],
        };
      }
      return { rows: [] };
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/loads/${LOAD}/team-split`,
      payload: {
        operating_company_id: COMPANY,
        primary_driver_id: PRIMARY,
        secondary_driver_id: SECONDARY,
        primary_ratio: 0.7,
        secondary_ratio: 0.3,
        reason: "one_off_team",
      },
    });

    expect(res.statusCode).toBe(201);
    expect(overrideUpdateSql).toContain("team_split_override_primary_ratio");
    const body = res.json() as { override: { primary_ratio: number; reason: string } };
    expect(Number(body.override.primary_ratio)).toBeCloseTo(0.7);
    expect(body.override.reason).toBe("one_off_team");

    // Latch: once a split is applied to a settlement, the override is rejected.
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM driver_finance.team_settlement_splits")) return { rows: [{ id: "posted-1" }] };
      return { rows: [] };
    });
    const blocked = await app.inject({
      method: "POST",
      url: `/api/v1/loads/${LOAD}/team-split`,
      payload: {
        operating_company_id: COMPANY,
        primary_driver_id: PRIMARY,
        secondary_driver_id: SECONDARY,
        primary_ratio: 0.5,
        secondary_ratio: 0.5,
      },
    });
    expect(blocked.statusCode).toBe(409);
    expect((blocked.json() as { error: string }).error).toBe("E_SETTLEMENT_POSTED_SPLIT_IMMUTABLE");
  });
});

describe("team split resolver + settlement application (mdata.driver_teams source)", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("applies 60/40 team_split lines from the active mdata.driver_teams row", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("to_regclass")) return { rows: [{ ok: true }] };
      if (sql.includes("FROM mdata.loads")) {
        return {
          rows: [
            {
              team_id: null,
              override_primary_driver_id: null,
              override_secondary_driver_id: null,
              override_primary_ratio: null,
              override_secondary_ratio: null,
            },
          ],
        };
      }
      if (sql.includes("FROM mdata.driver_teams")) return { rows: [TEAM_ROW] };
      if (sql.includes("INSERT INTO driver_finance.settlement_lines")) return { rows: [] };
      return { rows: [] };
    });

    const result = await applyTeamSplitsForSettlement(
      { query: queryMock },
      {
        operatingCompanyId: COMPANY,
        settlementId: SETTLEMENT,
        loadId: LOAD,
        assignedDriverId: PRIMARY,
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

  it("prefers the mdata.loads per-load override over the team config", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM mdata.loads")) {
        return {
          rows: [
            {
              team_id: TEAM_ROW.id,
              override_primary_driver_id: PRIMARY,
              override_secondary_driver_id: SECONDARY,
              override_primary_ratio: 0.7,
              override_secondary_ratio: 0.3,
            },
          ],
        };
      }
      if (sql.includes("FROM mdata.driver_teams")) {
        throw new Error("resolver must not read driver_teams when the load override is set");
      }
      return { rows: [] };
    });

    const split = await resolveTeamSplitForLoad(
      { query: queryMock },
      { operatingCompanyId: COMPANY, loadId: LOAD, assignedDriverId: SECONDARY }
    );

    expect(split).not.toBeNull();
    expect(split?.source).toBe("load_override");
    expect(split?.primary_ratio).toBeCloseTo(0.7);
    expect(split?.secondary_ratio).toBeCloseTo(0.3);
  });

  it("returns null when the assigned driver has no active team and no override", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM mdata.loads")) {
        return {
          rows: [
            {
              team_id: null,
              override_primary_driver_id: null,
              override_secondary_driver_id: null,
              override_primary_ratio: null,
              override_secondary_ratio: null,
            },
          ],
        };
      }
      return { rows: [] };
    });

    const split = await resolveTeamSplitForLoad(
      { query: queryMock },
      { operatingCompanyId: COMPANY, loadId: LOAD, assignedDriverId: PRIMARY }
    );
    expect(split).toBeNull();
  });
});

describe("zero RETIRE-table SQL in the team-splits module", () => {
  it("apply.ts and team-splits.routes.ts contain no settlements.team_split_* references", () => {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    for (const file of ["apply.ts", "team-splits.routes.ts"]) {
      const src = fs.readFileSync(path.join(dir, file), "utf8");
      expect(src, `${file} must not reference RETIRE settlements.team_split tables`).not.toMatch(
        /settlements\.team_split_(configs|load_overrides)\b/
      );
    }
  });
});
