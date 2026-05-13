import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: vi.fn(),
}));

import { appendCrudAudit } from "../../audit/crud-audit.js";
import { createDriverBillArtifacts } from "../../dispatch/book-load.service.js";
import { canAccessDriverLoadBills } from "../driver-bills-access.js";
import { driverBillNumberFromLoadNumber } from "../driver-bill-number.js";
import { listDriverBillsForSettlementPeriod, settlementLoadRowsCoveringInvariant } from "../settlements.service.js";

describe("driver bills schema separation (P6-T11172)", () => {
  beforeEach(() => {
    vi.mocked(appendCrudAudit).mockClear();
  });

  it("derives canonical bill numbers from load numbers (Invariant #7)", () => {
    expect(driverBillNumberFromLoadNumber("L-20260513-0003")).toBe("B-20260513-0003");
    expect(driverBillNumberFromLoadNumber("l-13518")).toBe("B-13518");
    expect(settlementLoadRowsCoveringInvariant("L-13518", "B-13518")).toBe(true);
    expect(settlementLoadRowsCoveringInvariant("L-13518", "B-L-13518")).toBe(false);
  });

  it("keeps migration 0141 backfill idempotent (NOT EXISTS on legacy bill id)", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const migrationPath = path.resolve(here, "../../../../../db/migrations/0141_p6_t11172_driver_finance_driver_bills.sql");
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toMatch(/source_legacy_bill_id\s*=\s*ab\.id/s);
    expect(sql).toMatch(/memo\s+ILIKE\s+'Auto-created from load %'/i);
  });

  it("writes lockstep driver bills to driver_finance.driver_bills with canonical bill numbers", async () => {
    const statements: string[] = [];
    const client = {
      async query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: T[] }> {
        statements.push(sql);
        if (sql.includes("to_regclass")) {
          return { rows: [{ exists: true }] as T[] };
        }
        if (sql.includes("INSERT INTO driver_finance.driver_bills")) {
          expect(values?.[3]).toBe("B-20260513-0999");
          expect(values?.[6]).toBe(12500);
          return { rows: [{ id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" }] as T[] };
        }
        return { rows: [] };
      },
    };

    await createDriverBillArtifacts(
      client,
      {
        requestingUserUuid: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        requestingUserRole: "Owner",
        operating_company_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
        customer_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
        status: "dispatched",
        charges: [{ code: "LH", amount_cents: 12500 }],
        stops: [],
        save_mode: "book_dispatch",
        assigned_primary_driver_id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
      },
      {
        id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
        load_number: "L-20260513-0999",
        miles_shortest: 500,
        miles_practical: null,
      },
      "L-20260513-0999",
      []
    );

    expect(statements.some((s) => s.includes("INSERT INTO driver_finance.driver_bills"))).toBe(true);
    expect(statements.some((s) => s.includes("INSERT INTO accounting.bills"))).toBe(false);
    expect(statements.some((s) => s.includes("INSERT INTO accounting.bill_lines"))).toBe(false);
  });

  it("aggregates settlement-period bills with UNION dedupe against migrated legacy rows", async () => {
    let captured = "";
    const client = {
      async query<R = Record<string, unknown>>(sql: string): Promise<{ rows: R[] }> {
        captured = sql;
        return {
          rows: [
            {
              id: "1",
              load_number: "L-1",
              bill_number: "B-1",
              gross_amount_cents: 100,
              miles_basis: 10,
              miles_basis_type: "short",
              rate_per_mile_cents: 10,
              notes: "Auto-created from load L-1",
            },
          ] as R[],
        };
      },
    };

    const rows = await listDriverBillsForSettlementPeriod(client, {
      operatingCompanyId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      driverId: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
    });

    expect(captured).toMatch(/UNION ALL/is);
    expect(captured).toMatch(/NOT EXISTS\s*\(/s);
    expect(captured).toMatch(/source_legacy_bill_id/s);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.bill_number).toBe("B-1");
  });

  it("denies driver bill listing unless office roles or assigned driver identities match", () => {
    expect(canAccessDriverLoadBills("Driver", "user-1", "user-2", null)).toBe(false);
    expect(canAccessDriverLoadBills("Driver", "user-1", "user-1", null)).toBe(true);
    expect(canAccessDriverLoadBills("Owner", "user-1", null, null)).toBe(true);
    expect(canAccessDriverLoadBills("Administrator", "user-1", null, null)).toBe(true);
    expect(canAccessDriverLoadBills("Accountant", "user-1", null, null)).toBe(true);
  });
});
