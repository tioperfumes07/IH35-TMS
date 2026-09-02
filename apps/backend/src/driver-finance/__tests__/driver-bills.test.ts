import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: vi.fn(),
  // book-load → from-load (ND-INV) pulls lucia adapter which needs luciaPool at module load
  luciaPool: {},
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

  it("driver bill number EQUALS the load number, unchanged (GO-27 Gate 0.3 / GO-19 display-id law)", () => {
    expect(driverBillNumberFromLoadNumber("L-20260513-0003")).toBe("L-20260513-0003");
    expect(driverBillNumberFromLoadNumber("13518")).toBe("13518");
    expect(settlementLoadRowsCoveringInvariant("L-13518", "L-13518")).toBe(true);
    expect(settlementLoadRowsCoveringInvariant("L-13518", "B-13518")).toBe(false);
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
        // ACCT-F63: driver pay resolves from the rate card, never from the customer charges.
        if (sql.includes("driver_finance.driver_pay_rates")) {
          return {
            rows: [
              {
                basis_type: "per_mile_pay",
                rate_per_mile_cents: "48",
                flat_per_load_cents: null,
                miles_basis: "short_miles",
              },
            ] as T[],
          };
        }
        if (sql.includes("INSERT INTO driver_finance.driver_bills")) {
          expect(values?.[3]).toBe("L-20260513-0999");
          // 48c/mi x miles_shortest 500 = 24,000c. NOT the 12,500c customer charge on this load —
          // that equality was the ACCT-F63 defect this test used to enshrine.
          expect(values?.[6]).toBe(24000);
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

  it("GO-21 B5: a typed per-load rate with NO override reason is never used — never a bare editable box that looks like data entry", async () => {
    const statements: string[] = [];
    const client = {
      async query<T = Record<string, unknown>>(sql: string): Promise<{ rows: T[] }> {
        statements.push(sql);
        if (sql.includes("to_regclass")) return { rows: [{ exists: true }] as T[] };
        // No driver_finance.driver_pay_rates row either — nothing to resolve pay from.
        if (sql.includes("driver_finance.driver_pay_rates")) return { rows: [] as T[] };
        return { rows: [] };
      },
    };

    const outcome = await createDriverBillArtifacts(
      client,
      {
        requestingUserUuid: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        requestingUserRole: "Owner",
        operating_company_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
        customer_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
        status: "dispatched",
        charges: [{ code: "LH", amount_cents: 30000 }],
        stops: [],
        save_mode: "book_dispatch",
        assigned_primary_driver_id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
      },
      {
        id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
        load_number: "L-20260513-0997",
        miles_shortest: 250,
        miles_practical: null,
        driver_pay_rate_per_mile: 1.0,
        // deliberately no driver_pay_rate_override_reason
      },
      "L-20260513-0997",
      []
    );

    expect(statements.some((s) => s.includes("INSERT INTO driver_finance.driver_bills"))).toBe(false);
    expect(outcome.outcome).toBe("skipped_no_pay_rate");
  });

  it("GO-21 B5: a typed per-load rate WITH a real override reason is used, and the override is logged", async () => {
    const statements: string[] = [];
    const client = {
      async query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: T[] }> {
        statements.push(sql);
        if (sql.includes("to_regclass")) return { rows: [{ exists: true }] as T[] };
        // No driver_finance.driver_pay_rates row — the override is the only source.
        if (sql.includes("driver_finance.driver_pay_rates")) return { rows: [] as T[] };
        if (sql.includes("INSERT INTO driver_finance.driver_bills")) {
          expect(values?.[6]).toBe(25000); // 1.00 $/mi * 100c * 250 short miles
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
        charges: [{ code: "LH", amount_cents: 30000 }],
        stops: [],
        save_mode: "book_dispatch",
        assigned_primary_driver_id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
      },
      {
        id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
        load_number: "L-20260513-0996",
        miles_shortest: 250,
        miles_practical: null,
        driver_pay_rate_per_mile: 1.0,
        driver_pay_rate_override_reason: "Customer requested a dedicated rate for this expedited lane.",
      },
      "L-20260513-0996",
      []
    );

    expect(statements.some((s) => s.includes("INSERT INTO driver_finance.driver_bills"))).toBe(true);
    expect(vi.mocked(appendCrudAudit).mock.calls.some((call) => call[2] === "driver_finance.driver_pay_rate.overridden")).toBe(true);
  });

  it("GO-27 Gate 1.4: profile pay rate is the base case and wins by default — a typed override only wins when it explicitly, accountably beats it, never silently", async () => {
    const statements: string[] = [];
    const client = {
      async query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: T[] }> {
        statements.push(sql);
        if (sql.includes("to_regclass")) return { rows: [{ exists: true }] as T[] };
        // A REAL, active driver_pay_rates card exists: 48c/mi x 250 short miles = 12,000c.
        if (sql.includes("driver_finance.driver_pay_rates")) {
          return {
            rows: [
              {
                basis_type: "per_mile_pay",
                rate_per_mile_cents: "48",
                flat_per_load_cents: null,
                miles_basis: "short_miles",
              },
            ] as T[],
          };
        }
        if (sql.includes("INSERT INTO driver_finance.driver_bills")) {
          // The typed $1.00/mi override (100c * 250mi = 25,000c) wins over the 12,000c card because
          // it carries an explicit, logged reason — GO-21 B5's own "explicit override, never silent"
          // rule, which is exactly what Gate 1.4 asks this test to confirm rather than assume.
          expect(values?.[6]).toBe(25000);
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
        charges: [{ code: "LH", amount_cents: 30000 }],
        stops: [],
        save_mode: "book_dispatch",
        assigned_primary_driver_id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
      },
      {
        id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
        load_number: "L-20260513-0995",
        miles_shortest: 250,
        miles_practical: null,
        driver_pay_rate_per_mile: 1.0,
        driver_pay_rate_override_reason: "Customer requested a dedicated rate for this expedited lane.",
      },
      "L-20260513-0995",
      []
    );

    expect(statements.some((s) => s.includes("INSERT INTO driver_finance.driver_bills"))).toBe(true);
    // The audit record captures BOTH numbers — what the profile card would have paid and what the
    // override actually paid — so the accountability trail is complete, not just "an override
    // happened."
    const overrideCall = vi.mocked(appendCrudAudit).mock.calls.find((call) => call[2] === "driver_finance.driver_pay_rate.overridden");
    expect(overrideCall).toBeTruthy();
    expect((overrideCall?.[3] as Record<string, unknown> | undefined)?.driver_profile_rate_cents).toBe(12000);
    expect((overrideCall?.[3] as Record<string, unknown> | undefined)?.override_cents).toBe(25000);
  });

  it("MILES SPEC: splits loaded vs deadhead pay using the driver's own rate_empty_per_mile_cents (never equal to rate_loaded by assumption)", async () => {
    const statements: string[] = [];
    const client = {
      async query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: T[] }> {
        statements.push(sql);
        if (sql.includes("to_regclass")) return { rows: [{ exists: true }] as T[] };
        if (sql.includes("driver_finance.driver_pay_rates")) {
          return {
            rows: [
              {
                basis_type: "per_mile_pay",
                rate_per_mile_cents: "48",
                flat_per_load_cents: null,
                miles_basis: "short_miles",
                rate_empty_per_mile_cents: "30",
              },
            ] as T[],
          };
        }
        if (sql.includes("INSERT INTO driver_finance.driver_bills")) {
          // 48c/mi loaded x 500 short miles = 24,000c; 30c/mi empty x 100 deadhead miles = 3,000c.
          expect(values?.[6]).toBe(27000); // gross_amount_cents — the one payable total, unchanged shape
          expect(values?.[12]).toBe(100); // miles_deadhead snapshotted
          expect(values?.[13]).toBe(30); // rate_empty_per_mile_cents actually used
          expect(values?.[14]).toBe(24000); // loaded_pay_cents
          expect(values?.[15]).toBe(3000); // deadhead_pay_cents
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
        charges: [{ code: "LH", amount_cents: 30000 }],
        stops: [],
        save_mode: "book_dispatch",
        assigned_primary_driver_id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
      },
      {
        id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
        load_number: "L-20260902-0001",
        miles_shortest: 500,
        miles_practical: null,
        miles_deadhead: 100,
      },
      "L-20260902-0001",
      []
    );

    expect(statements.some((s) => s.includes("INSERT INTO driver_finance.driver_bills"))).toBe(true);
  });

  it("MILES SPEC: deadhead falls back LIVE to the loaded rate_per_mile_cents when rate_empty_per_mile_cents is not configured for this driver (a live fallback, never a stored duplicate)", async () => {
    const statements: string[] = [];
    const client = {
      async query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: T[] }> {
        statements.push(sql);
        if (sql.includes("to_regclass")) return { rows: [{ exists: true }] as T[] };
        if (sql.includes("driver_finance.driver_pay_rates")) {
          return {
            rows: [
              {
                basis_type: "per_mile_pay",
                rate_per_mile_cents: "48",
                flat_per_load_cents: null,
                miles_basis: "short_miles",
                rate_empty_per_mile_cents: null,
              },
            ] as T[],
          };
        }
        if (sql.includes("INSERT INTO driver_finance.driver_bills")) {
          expect(values?.[6]).toBe(28800); // 24,000 loaded + 4,800 deadhead (100mi @ the loaded 48c fallback)
          expect(values?.[13]).toBe(48); // the resolved rate used IS the loaded rate — a live fallback
          expect(values?.[14]).toBe(24000);
          expect(values?.[15]).toBe(4800);
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
        charges: [{ code: "LH", amount_cents: 30000 }],
        stops: [],
        save_mode: "book_dispatch",
        assigned_primary_driver_id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
      },
      {
        id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
        load_number: "L-20260902-0002",
        miles_shortest: 500,
        miles_practical: null,
        miles_deadhead: 100,
      },
      "L-20260902-0002",
      []
    );

    expect(statements.some((s) => s.includes("INSERT INTO driver_finance.driver_bills"))).toBe(true);
  });

  it("MILES SPEC: no miles_deadhead captured on the load -> bill stays loaded-only, deadhead columns null/zero (backward compatible with pre-spec bookings)", async () => {
    const client = {
      async query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: T[] }> {
        if (sql.includes("to_regclass")) return { rows: [{ exists: true }] as T[] };
        if (sql.includes("driver_finance.driver_pay_rates")) {
          return {
            rows: [
              { basis_type: "per_mile_pay", rate_per_mile_cents: "48", flat_per_load_cents: null, miles_basis: "short_miles", rate_empty_per_mile_cents: "30" },
            ] as T[],
          };
        }
        if (sql.includes("INSERT INTO driver_finance.driver_bills")) {
          expect(values?.[6]).toBe(24000);
          expect(values?.[12]).toBeNull();
          expect(values?.[13]).toBeNull();
          expect(values?.[14]).toBe(24000);
          expect(values?.[15]).toBe(0);
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
        charges: [{ code: "LH", amount_cents: 30000 }],
        stops: [],
        save_mode: "book_dispatch",
        assigned_primary_driver_id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
      },
      {
        id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
        load_number: "L-20260902-0003",
        miles_shortest: 500,
        miles_practical: null,
        // no miles_deadhead
      },
      "L-20260902-0003",
      []
    );
  });

  it("MILES SPEC: team split proportions deadhead pay the SAME WAY it proportions the total (no separate guess at which co-driver drove the empty leg)", async () => {
    const inserted: Array<{ driverId: unknown; gross: unknown; deadhead: unknown; loaded: unknown }> = [];
    const client = {
      async query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: T[] }> {
        if (sql.includes("to_regclass")) return { rows: [{ exists: true }] as T[] };
        if (sql.includes("driver_finance.driver_pay_rates")) {
          return {
            rows: [
              { basis_type: "per_mile_pay", rate_per_mile_cents: "48", flat_per_load_cents: null, miles_basis: "short_miles", rate_empty_per_mile_cents: "30" },
            ] as T[],
          };
        }
        if (sql.includes("FROM mdata.driver_teams")) {
          return {
            rows: [
              {
                primary_driver_id: "11111111-1111-1111-1111-111111111111",
                secondary_driver_id: "22222222-2222-2222-2222-222222222222",
                split_method: "60_40",
                primary_share_pct: null,
                co_share_pct: null,
                is_active: true,
              },
            ] as T[],
          };
        }
        if (sql.includes("INSERT INTO driver_finance.driver_bills")) {
          inserted.push({ driverId: values?.[4], gross: values?.[6], deadhead: values?.[15], loaded: values?.[14] });
          return { rows: [{ id: `bill-${inserted.length}` }] as T[] };
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
        charges: [{ code: "LH", amount_cents: 30000 }],
        stops: [],
        save_mode: "book_dispatch",
        assigned_primary_driver_id: "11111111-1111-1111-1111-111111111111",
        team_id: "99999999-9999-9999-9999-999999999999",
      },
      {
        id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
        load_number: "L-20260902-0004",
        miles_shortest: 500,
        miles_practical: null,
        miles_deadhead: 100,
      },
      "L-20260902-0004",
      []
    );

    // total = 27,000c (24,000 loaded + 3,000 deadhead); 60/40 split.
    expect(inserted).toHaveLength(2);
    const primary = inserted.find((r) => r.driverId === "11111111-1111-1111-1111-111111111111");
    const secondary = inserted.find((r) => r.driverId === "22222222-2222-2222-2222-222222222222");
    expect(primary?.gross).toBe(16200); // round(27000 * 0.6)
    expect(primary?.deadhead).toBe(1800); // round(3000 * 0.6)
    expect(primary?.loaded).toBe(14400); // 16200 - 1800
    expect(secondary?.gross).toBe(10800); // 27000 - 16200
    expect(secondary?.deadhead).toBe(1200); // 3000 - 1800
    expect(secondary?.loaded).toBe(9600); // 10800 - 1200
  });

  it("ACCT-F63: refuses to mint a driver bill when no pay rate resolves, and records the skip", async () => {
    const statements: string[] = [];
    const client = {
      async query<T = Record<string, unknown>>(sql: string): Promise<{ rows: T[] }> {
        statements.push(sql);
        if (sql.includes("to_regclass")) return { rows: [{ exists: true }] as T[] };
        // No driver_pay_rates row -> pay cannot be sourced.
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
        load_number: "L-20260513-0998",
        miles_shortest: 500,
        miles_practical: null,
      },
      "L-20260513-0998",
      []
    );

    // The whole point: an unpriceable bill is NOT written at the customer rate (or at all)...
    expect(statements.some((s) => s.includes("INSERT INTO driver_finance.driver_bills"))).toBe(false);
    // ...and the refusal is countable rather than silent (appendCrudAudit is mocked in this suite,
    // so assert the call itself rather than its SQL text).
    expect(vi.mocked(appendCrudAudit)).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      "driver_finance.driver_bill.skipped_no_pay_rate",
      expect.objectContaining({ load_number: "L-20260513-0998" }),
      "warning",
      "WIRE-02"
    );
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
