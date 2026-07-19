import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerReportsLibraryRoutes } from "./library.routes.js";

const COMPANY_A = "11111111-1111-4111-8111-111111111111";
const COMPANY_B = "22222222-2222-4222-8222-222222222222";
const COMPANY_C = "33333333-3333-4333-8333-333333333333";

const mocks = vi.hoisted(() => {
  let activeCompany = "";
  let samsaraRelationExists = true;
  const countByCompany = new Map<string, string>();
  const query = vi.fn(async (sqlValue: unknown, params: unknown[] = []) => {
    const sql = String(sqlValue);
    if (sql.includes("set_config('app.operating_company_id'")) {
      expect(params).toEqual([activeCompany]);
      return { rows: [{ set_config: activeCompany }] };
    }
    if (sql.includes("to_regclass")) {
      const relation = String(params[0] ?? "");
      return {
        rows: [{
          rel: relation === "integrations.samsara_vehicles" && samsaraRelationExists
            ? relation
            : null,
        }],
      };
    }
    if (sql.includes("FROM integrations.samsara_vehicles")) {
      expect(sql).toContain(
        "operating_company_id = current_setting('app.operating_company_id', true)::uuid",
      );
      return { rows: [{ samsara_live: countByCompany.get(activeCompany) ?? "0" }] };
    }
    return { rows: [] };
  });
  return {
    query,
    countByCompany,
    setCompany(company: string) {
      activeCompany = company;
    },
    setRelationExists(value: boolean) {
      samsaraRelationExists = value;
    },
  };
});

vi.mock("./shared.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./shared.js")>();
  return {
    ...actual,
    currentAuthUser: () => ({
      uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      role: "Owner",
    }),
    withCompanyScope: async (
      _userId: string,
      operatingCompanyId: string,
      run: (client: { query: typeof mocks.query }) => Promise<unknown>,
    ) => {
      mocks.setCompany(operatingCompanyId);
      return run({ query: mocks.query });
    },
  };
});

describe("reports home fleet Samsara live counter", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];

  beforeEach(() => {
    mocks.query.mockClear();
    mocks.countByCompany.clear();
    mocks.setRelationExists(true);
  });

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  async function request(companyId: string) {
    const app = Fastify({ logger: false });
    apps.push(app);
    await registerReportsLibraryRoutes(app);
    await app.ready();
    return app.inject({
      method: "GET",
      url: `/api/v1/reports/home-fleet-snapshot?operating_company_id=${companyId}`,
    });
  }

  it("returns the scoped database query result in samsara_live", async () => {
    mocks.countByCompany.set(COMPANY_A, "7");

    const response = await request(COMPANY_A);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ samsara_live: 7 });
    expect(
      mocks.query.mock.calls.some(([sql]) =>
        String(sql).includes("FROM integrations.samsara_vehicles"),
      ),
    ).toBe(true);
  });

  it("returns zero when the Samsara relation and fallback relation are absent", async () => {
    mocks.setRelationExists(false);

    const response = await request(COMPANY_C);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ samsara_live: 0 });
    expect(
      mocks.query.mock.calls.some(([sql]) =>
        String(sql).includes("FROM integrations.samsara_vehicles"),
      ),
    ).toBe(false);
  });

  it("cannot return another operating company's count", async () => {
    mocks.countByCompany.set(COMPANY_A, "91");
    mocks.countByCompany.set(COMPANY_B, "3");

    const response = await request(COMPANY_B);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ samsara_live: 3 });
    expect(response.json()).not.toMatchObject({ samsara_live: 91 });
    expect(
      mocks.query.mock.calls.some(
        ([sql, params]) =>
          String(sql).includes("set_config('app.operating_company_id'") &&
          Array.isArray(params) &&
          params[0] === COMPANY_B,
      ),
    ).toBe(true);
  });
});
