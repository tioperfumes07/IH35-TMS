import { describe, expect, it, vi } from "vitest";

vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async () => undefined) }));

const { runDriverSubAccountBackfill, parseDriverRosterCsv } = await import("../driver-subaccount-backfill.service.js");

const ASSET_PARENT = "asset-parent";
const ESCROW_PARENT = "escrow-parent";

// A client where the parents resolve, and a given set of sub-account names are reported as already existing.
function makeClient(opts: { roster: { id: string; first_name: string; last_name: string }[]; existingNames: Set<string> }) {
  const sqls: { sql: string; params: unknown[] }[] = [];
  const client = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      sqls.push({ sql, params: params ?? [] });
      if (sql.includes("FROM mdata.drivers") && sql.includes("operating_company_id = $1")) {
        return { rows: opts.roster };
      }
      // resolveCanonicalParentAccount: by parent name + type
      if (sql.includes("parent_account_id IS NULL")) {
        const [name] = params as [string, string];
        return { rows: [{ id: name === "Driver Cash Advance" ? ASSET_PARENT : ESCROW_PARENT }] };
      }
      // exists check: by sub-account name + parent
      if (sql.includes("parent_account_id = $2::uuid") && sql.includes("SELECT id")) {
        const [subName] = params as [string, string];
        return { rows: opts.existingNames.has(subName) ? [{ id: "exists-" + subName }] : [] };
      }
      return { rows: [] };
    }),
  };
  return { client, sqls };
}

describe("driver sub-account bulk backfill — DRY-RUN", () => {
  it("classifies CREATE vs SKIP-exists per driver and writes NOTHING (apply defaults OFF)", async () => {
    const { client, sqls } = makeClient({
      roster: [
        { id: "d1", first_name: "Ana", last_name: "Reyes" }, // both missing -> CREATE/CREATE
        { id: "d2", first_name: "Beto", last_name: "Cruz" }, // asset exists, escrow missing
      ],
      existingNames: new Set(["Driver Cash Advance- Beto Cruz"]),
    });

    const report = await runDriverSubAccountBackfill(client as never, { operatingCompanyId: "oc" });

    expect(report.mode).toBe("dry-run"); // apply defaults OFF
    expect(report.rows).toEqual([
      { driver_id: "d1", driver_name: "Ana Reyes", asset_subaccount: "CREATE", escrow_subaccount: "CREATE" },
      { driver_id: "d2", driver_name: "Beto Cruz", asset_subaccount: "SKIP-exists", escrow_subaccount: "CREATE" },
    ]);
    expect(report.totals).toMatchObject({ drivers_scanned: 2, asset_to_create: 1, escrow_to_create: 2, already_existing: 1 });

    // ZERO writes in dry-run.
    expect(sqls.some((s) => /\b(INSERT|UPDATE|DELETE)\b/i.test(s.sql))).toBe(false);
  });

  it("reports SKIP-no-parent (and writes nothing) when the chart lacks a parent (e.g. TRK)", async () => {
    const sqls: { sql: string }[] = [];
    const client = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        sqls.push({ sql });
        if (sql.includes("FROM mdata.drivers")) return { rows: [{ id: "d1", first_name: "Trk", last_name: "Driver" }] };
        if (sql.includes("parent_account_id IS NULL")) return { rows: [] }; // no parents in this chart
        return { rows: [] };
      }),
    };
    const report = await runDriverSubAccountBackfill(client as never, { operatingCompanyId: "trk" });
    expect(report.rows[0]).toMatchObject({ asset_subaccount: "SKIP-no-parent", escrow_subaccount: "SKIP-no-parent" });
    expect(report.totals.no_parent).toBe(1);
    expect(sqls.some((s) => /\b(INSERT|UPDATE|DELETE)\b/i.test(s.sql))).toBe(false);
  });

  it("accepts an explicit driver list (Excel/CSV path) instead of the DB roster", async () => {
    const { client } = makeClient({ roster: [], existingNames: new Set() });
    const report = await runDriverSubAccountBackfill(client as never, {
      operatingCompanyId: "oc",
      drivers: [{ driverId: "x1", driverName: "Carlos Mata" }],
    });
    expect(report.totals.drivers_scanned).toBe(1);
    expect(report.rows[0]).toMatchObject({ driver_name: "Carlos Mata", asset_subaccount: "CREATE", escrow_subaccount: "CREATE" });
  });
});

describe("parseDriverRosterCsv", () => {
  it("parses name + id columns", () => {
    const csv = "driver_name,driver_id\nAna Reyes,d1\nBeto Cruz,d2";
    expect(parseDriverRosterCsv(csv)).toEqual([
      { driverName: "Ana Reyes", driverId: "d1" },
      { driverName: "Beto Cruz", driverId: "d2" },
    ]);
  });
});
