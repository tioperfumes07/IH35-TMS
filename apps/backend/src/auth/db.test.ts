import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const releaseMock = vi.fn();
const connectMock = vi.fn();

vi.mock("pg", () => ({
  default: {
    Pool: vi.fn(() => ({
      connect: connectMock,
      on: vi.fn(),
    })),
  },
}));

vi.mock("../lib/pg-connection-options.js", () => ({
  buildPgPoolConfig: (url: string) => ({ connectionString: url }),
}));

describe("withLuciaBypass session context", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    queryMock.mockResolvedValue({ rows: [] });
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock });
    process.env.DATABASE_URL = "postgres://verify:verify@localhost:54329/ih35_verify";
    process.env.DATABASE_DIRECT_URL = "postgres://verify:verify@localhost:54329/ih35_verify";
  });

  it("sets bypass_rls and sentinel company session vars inside a transaction", async () => {
    const { withLuciaBypass, LUCIA_BYPASS_SENTINEL_COMPANY_ID } = await import("./db.js");

    await withLuciaBypass(async () => ({ ok: true }));

    expect(queryMock.mock.calls.map(([sql]) => String(sql))).toEqual([
      "BEGIN",
      // #878 fail-closed: non-superuser app role forced transaction-locally before any bypass SQL.
      "SET LOCAL ROLE ih35_app",
      // bypass_rls is a literal constant (no interpolation) — still set via SET LOCAL.
      "SET LOCAL app.bypass_rls = 'lucia'",
      // SQLi→RLS-bypass hardening: sentinel company GUCs are now PARAMETERIZED via set_config
      // (bound value), never string-interpolated into the SQL text.
      "SELECT set_config('app.active_company_id', $1, true)",
      "SELECT set_config('app.operating_company_id', $1, true)",
      "COMMIT",
    ]);
    // Prove the sentinel is passed as a BOUND value (not interpolated) to each set_config call.
    const setConfigCalls = queryMock.mock.calls.filter(([sql]) =>
      String(sql).startsWith("SELECT set_config(")
    );
    expect(setConfigCalls).toHaveLength(2);
    for (const [, values] of setConfigCalls) {
      expect(values).toEqual([LUCIA_BYPASS_SENTINEL_COMPANY_ID]);
    }
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it("withCurrentUser forces ih35_app role before setting the tenant user GUC (#878 fail-closed)", async () => {
    const { withCurrentUser } = await import("./db.js");

    await withCurrentUser("11111111-1111-1111-1111-111111111111", async () => ({ ok: true }));

    const sqls = queryMock.mock.calls.map(([sql]) => String(sql));
    const roleAt = sqls.findIndex((s) => s === "SET LOCAL ROLE ih35_app");
    const guidAt = sqls.findIndex((s) => s.includes("app.current_user_id"));
    expect(roleAt).toBeGreaterThanOrEqual(0);
    expect(guidAt).toBeGreaterThanOrEqual(0);
    // Role must be assumed BEFORE any tenant-scoped statement so RLS can never run as a superuser.
    expect(roleAt).toBeLessThan(guidAt);
    expect(sqls[0]).toBe("BEGIN");
  });

  it("uses all-zeros sentinel uuid format", async () => {
    const { LUCIA_BYPASS_SENTINEL_COMPANY_ID } = await import("./db.js");
    expect(LUCIA_BYPASS_SENTINEL_COMPANY_ID).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(LUCIA_BYPASS_SENTINEL_COMPANY_ID).toBe("00000000-0000-0000-0000-000000000000");
  });
});

describe("0359_rls_uuid_cast_defensive migration", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const migrationPath = path.resolve(
    here,
    "../../../../db/migrations/0359_rls_uuid_cast_defensive.sql"
  );

  it("exists and alters policies with NULLIF wrap (no DROP POLICY)", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    const executable = sql
      .split(/\r?\n/)
      .filter((line) => !/^\s*--/.test(line))
      .join("\n");
    expect(sql).toMatch(/rls_uuid_cast_defensive/);
    expect(executable).toMatch(/ALTER POLICY/);
    expect(executable).toMatch(/NULLIF\(current_setting/);
    expect(executable).not.toMatch(/DROP POLICY/i);
  });
});
