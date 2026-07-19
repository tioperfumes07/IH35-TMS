import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerReportsLibraryRoutes } from "./library.routes.js";

const COMPANY_A = "11111111-1111-4111-8111-111111111111";
const COMPANY_B = "22222222-2222-4222-8222-222222222222";
const COMPANY_C = "33333333-3333-4333-8333-333333333333";
const COMPANY_D = "44444444-4444-4444-8444-444444444444";

function stripSqlComments(sql: string) {
  let output = "";
  let index = 0;
  let inString = false;
  while (index < sql.length) {
    if (inString) {
      output += sql[index];
      if (sql[index] === "'" && sql[index + 1] === "'") {
        output += sql[index + 1];
        index += 2;
        continue;
      }
      if (sql[index] === "'") inString = false;
      index += 1;
      continue;
    }
    if (sql[index] === "'") {
      inString = true;
      output += sql[index];
      index += 1;
      continue;
    }
    if (sql[index] === "-" && sql[index + 1] === "-") {
      index += 2;
      while (index < sql.length && sql[index] !== "\n") index += 1;
      continue;
    }
    if (sql[index] === "/" && sql[index + 1] === "*") {
      const end = sql.indexOf("*/", index + 2);
      if (end < 0) throw new Error("unterminated SQL block comment");
      index = end + 2;
      continue;
    }
    output += sql[index];
    index += 1;
  }
  if (inString) throw new Error("unterminated SQL string");
  return output;
}

function parseExecutableCounterSql(sql: string) {
  const executable = stripSqlComments(sql).replace(/\s+/g, " ").trim();
  const select = executable.match(/^SELECT\s+(.+?)\s+FROM\s+/i)?.[1] ?? "";
  const from = executable.match(/\sFROM\s+([A-Za-z0-9_.]+)\s+WHERE\s+/i)?.[1] ?? "";
  const where = executable.match(/\sWHERE\s+(.+)$/i)?.[1] ?? "";
  if (!/^count\s*\(\s*DISTINCT\s+local_unit_id\s*\)::text\s+AS\s+samsara_live$/i.test(select)) {
    throw new Error("counter SQL SELECT must derive samsara_live from count(DISTINCT local_unit_id)");
  }
  if (from !== "integrations.samsara_vehicles") {
    throw new Error("counter SQL FROM target is not integrations.samsara_vehicles");
  }
  if (/\bJOIN\b/i.test(executable)) throw new Error("counter SQL must not add JOIN semantics");
  for (const predicate of [
    /operating_company_id\s*=\s*current_setting\('app\.operating_company_id',\s*true\)::uuid/i,
    /local_unit_id\s+IS\s+NOT\s+NULL/i,
    /last_seen_at\s*>=\s*now\(\)\s*-\s*interval\s*'6 hours'/i,
  ]) {
    if (!predicate.test(where)) throw new Error(`counter SQL WHERE missing ${predicate}`);
  }
  return executable;
}

function parseExecutableGucSql(sql: string) {
  const executable = stripSqlComments(sql).replace(/\s+/g, " ").trim();
  if (
    !/^SELECT\s+set_config\(\s*'app\.operating_company_id'\s*,\s*\$1\s*,\s*true\s*\)$/i.test(
      executable,
    )
  ) {
    throw new Error("GUC SQL must execute set_config for app.operating_company_id using $1");
  }
  return executable;
}

const mocks = vi.hoisted(() => {
  let activeCompany = "";
  let gucCompany = "";
  let samsaraRelationExists = true;
  const countByCompany = new Map<string, string>();
  const query = vi.fn(async (sqlValue: unknown, params: unknown[] = []) => {
    const sql = String(sqlValue);
    const executableSql = stripSqlComments(sql).replace(/\s+/g, " ").trim();
    if (/\bset_config\b/i.test(sql) || /^SELECT\s+set_config\b/i.test(executableSql)) {
      parseExecutableGucSql(sql);
      expect(params).toEqual([activeCompany]);
      gucCompany = String(params[0] ?? "");
      return { rows: [{ set_config: activeCompany }] };
    }
    if (sql.includes("to_regclass")) {
      if (gucCompany !== activeCompany) throw new Error("company GUC was not established before relation query");
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
      parseExecutableCounterSql(sql);
      return { rows: [{ samsara_live: countByCompany.get(activeCompany) ?? "0" }] };
    }
    return { rows: [] };
  });
  return {
    query,
    countByCompany,
    setCompany(company: string) {
      activeCompany = company;
      gucCompany = "";
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

  it("returns an arbitrary fourth company's exact query result without cross-company substitution", async () => {
    mocks.countByCompany.set(COMPANY_A, "991");
    mocks.countByCompany.set(COMPANY_D, "47");

    const response = await request(COMPANY_D);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ samsara_live: 47 });
    expect(response.json()).not.toMatchObject({ samsara_live: 991 });
  });

  it("rejects a hardcoded SELECT whose required semantics exist only in comments", async () => {
    const decoySql = `
      SELECT '999' AS samsara_live
      /* SELECT count(DISTINCT local_unit_id)::text AS samsara_live
         FROM integrations.samsara_vehicles
         WHERE operating_company_id = current_setting('app.operating_company_id', true)::uuid
           AND local_unit_id IS NOT NULL
           AND last_seen_at >= now() - interval '6 hours' */
    `;

    await expect(mocks.query(decoySql)).rejects.toThrow(
      "counter SQL SELECT must derive samsara_live",
    );
  });

  it("rejects a no-op GUC query whose set_config call exists only in a comment", async () => {
    await expect(
      mocks.query(
        "SELECT 1 /* set_config('app.operating_company_id', $1, true) */",
        [COMPANY_D],
      ),
    ).rejects.toThrow("GUC SQL must execute set_config");
  });
});
