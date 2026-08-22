import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerDriverTeamRoutes } from "./driver-teams.routes.js";

/**
 * CC3-DRIVERTEAMS-COMPANY-JOIN-20260822 regression coverage.
 *
 * ROOT CAUSE: `driverBelongsToCompany` in this file JOINed org.user_company_access on
 * `uca.user_id = d.identity_user_id` -- a check on which HUMAN LOGIN ACCOUNTS can access which
 * company, not on which company a driver ROW belongs to. Most drivers never get a Driver PWA
 * login (identity_user_id NULL), so the JOIN silently excluded them from EVERY team creation
 * even though `d.operating_company_id` -- the actual, sufficient membership predicate -- matched.
 * Live-reproduced 2026-08-22: real USMCA drivers offered by the Primary/Secondary Driver pickers
 * on Lists > Drivers > Driver Teams were rejected by POST /api/v1/mdata/driver-teams with
 * `drivers_not_in_operating_company`. The identical defect was already root-caused and fixed in
 * the sibling `assertDriverCompany` (driver-team.service.ts, 2026-08-18) -- this ports that fix.
 */

const TEST_OPCO = "11111111-1111-4111-8111-111111111111";
const PRIMARY_DRIVER_ID = "22222222-2222-4222-8222-222222222222";
const SECONDARY_DRIVER_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_COMPANY_DRIVER_ID = "44444444-4444-4444-8444-444444444444";

const insertedSql: string[] = [];

// Drivers with identity_user_id = NULL (no Driver PWA login) -- the exact shape that used to be
// silently excluded by the old JOIN. `operating_company_id` alone decides membership here.
const DRIVERS: Record<string, { operating_company_id: string; identity_user_id: string | null }> = {
  [PRIMARY_DRIVER_ID]: { operating_company_id: TEST_OPCO, identity_user_id: null },
  [SECONDARY_DRIVER_ID]: { operating_company_id: TEST_OPCO, identity_user_id: null },
  [OTHER_COMPANY_DRIVER_ID]: { operating_company_id: "99999999-9999-4999-8999-999999999999", identity_user_id: null },
};

const queryMock = vi.fn(async (sql: string, values?: unknown[]) => {
  // driverBelongsToCompany's own membership check.
  if (sql.includes("FROM mdata.drivers d") && sql.includes("WHERE d.id = $1")) {
    const [driverId, companyId] = values as [string, string];
    // The fix must never re-introduce a JOIN to org.user_company_access on this query.
    expect(sql).not.toContain("user_company_access");
    const driver = DRIVERS[driverId];
    const matches = driver && driver.operating_company_id === companyId;
    return { rows: matches ? [{ id: driverId }] : [] };
  }
  if (sql.includes("FROM org.companies")) {
    return { rows: [{ id: TEST_OPCO }] };
  }
  if (sql.includes("FROM mdata.driver_teams WHERE")) {
    return { rows: [] }; // no existing active team for either driver
  }
  if (sql.trim().startsWith("INSERT INTO mdata.driver_teams")) {
    insertedSql.push(sql);
    return {
      rows: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          operating_company_id: values?.[0],
          team_name: values?.[1],
          primary_driver_id: values?.[2],
          secondary_driver_id: values?.[3],
          relationship: values?.[4],
          notes: values?.[5],
          effective_from: values?.[6],
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    };
  }
  return { rows: [] };
});

vi.mock("../auth/session-middleware.js", () => ({
  requireAuth: () => true,
}));

vi.mock("../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
    fn({ query: queryMock }),
}));

vi.mock("../auth/operating-company-scope.js", () => ({
  resolveOperatingCompanyId: vi.fn(async () => TEST_OPCO),
}));

vi.mock("../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn(async () => undefined),
  buildPatchChanges: vi.fn(() => ({})),
}));

describe.sequential("driver-teams.routes -- driverBelongsToCompany company scope", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    queryMock.mockClear();
    insertedSql.length = 0;
  });

  async function buildApp() {
    const app = Fastify();
    apps.push(app);
    app.addHook("preHandler", async (req) => {
      (req as { user?: { uuid: string; role: string } }).user = {
        uuid: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        role: "Owner",
      };
    });
    await registerDriverTeamRoutes(app);
    return app;
  }

  it("creates a team from two same-company drivers with no identity_user_id (no Driver PWA login)", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/mdata/driver-teams",
      payload: {
        operating_company_id: TEST_OPCO,
        team_name: "CC3-TEST-TEAM",
        primary_driver_id: PRIMARY_DRIVER_ID,
        secondary_driver_id: SECONDARY_DRIVER_ID,
      },
    });
    expect(response.statusCode).toBe(201);
    expect(insertedSql).toHaveLength(1);
  });

  it("still rejects a driver whose operating_company_id genuinely does not match (real protection kept)", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/mdata/driver-teams",
      payload: {
        operating_company_id: TEST_OPCO,
        team_name: "CC3-TEST-TEAM-2",
        primary_driver_id: PRIMARY_DRIVER_ID,
        secondary_driver_id: OTHER_COMPANY_DRIVER_ID,
      },
    });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe("drivers_not_in_operating_company");
    expect(insertedSql).toHaveLength(0);
  });
});
