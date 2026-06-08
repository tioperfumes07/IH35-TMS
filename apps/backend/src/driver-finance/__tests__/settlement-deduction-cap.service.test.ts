import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn().mockResolvedValue(undefined),
}));

import { appendCrudAudit } from "../../audit/crud-audit.js";
import {
  applyPendingDeductionsToSettlementWithNetFloor,
  resolveSettlementMinNet,
} from "../settlement-deduction-cap.service.js";

type PendingDeduction = { id: string; amount_cents: number; reason: string; deduction_type: string };

type MockOpts = {
  hasSettlementLines?: boolean;
  hasDriverCols?: boolean;
  hasCompanyCols?: boolean;
  driverRow?: { pct: number | null; cents: number | null } | null;
  companyRow?: { pct: number | null; cents: number | null } | null;
  grossCents?: number;
  pending?: PendingDeduction[];
};

function makeMockClient(opts: MockOpts = {}) {
  const calls: { sql: string; values?: unknown[] }[] = [];
  const updatedDeductionIds: string[] = [];
  const insertedLines: { description: string; amount: number }[] = [];
  let lineSeq = 0;

  const client = {
    async query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: T[]; rowCount: number }> {
      calls.push({ sql, values });

      if (sql.includes("to_regclass('driver_finance.settlement_lines')")) {
        return { rows: [{ ok: opts.hasSettlementLines ?? true }] as T[], rowCount: 1 };
      }
      if (sql.includes("FROM information_schema.columns")) {
        const schema = String(values?.[0] ?? "");
        const ok = schema === "mdata" ? (opts.hasDriverCols ?? true) : (opts.hasCompanyCols ?? true);
        return { rows: [{ ok }] as T[], rowCount: 1 };
      }
      if (sql.includes("SUM(amount)") && sql.includes("FROM driver_finance.settlement_lines")) {
        return { rows: [{ gross_cents: opts.grossCents ?? 0 }] as T[], rowCount: 1 };
      }
      if (sql.includes("FROM mdata.drivers")) {
        const row = opts.driverRow;
        return { rows: (row ? [row] : []) as T[], rowCount: row ? 1 : 0 };
      }
      if (sql.includes("FROM org.companies")) {
        const row = opts.companyRow;
        return { rows: (row ? [row] : []) as T[], rowCount: row ? 1 : 0 };
      }
      if (sql.includes("SELECT") && sql.includes("FROM driver_finance.driver_settlement_deductions")) {
        return { rows: (opts.pending ?? []) as unknown as T[], rowCount: (opts.pending ?? []).length };
      }
      if (sql.includes("INSERT INTO driver_finance.settlement_lines")) {
        lineSeq += 1;
        insertedLines.push({ description: String(values?.[1] ?? ""), amount: Number(values?.[2] ?? 0) });
        return { rows: [{ id: `line-${lineSeq}` }] as T[], rowCount: 1 };
      }
      if (sql.includes("UPDATE driver_finance.driver_settlement_deductions")) {
        updatedDeductionIds.push(String(values?.[0] ?? ""));
        return { rows: [] as T[], rowCount: 1 };
      }
      return { rows: [] as T[], rowCount: 0 };
    },
  };

  return { client, calls, updatedDeductionIds, insertedLines };
}

const IDS = {
  settlement: "set00000-0000-0000-0000-000000000001",
  driver: "dr000000-0000-0000-0000-000000000001",
  company: "oc000000-0000-0000-0000-000000000001",
  actor: "usr00000-0000-0000-0000-000000000001",
};

describe("resolveSettlementMinNet", () => {
  const ORIG_ENV = process.env.SETTLEMENT_MIN_NET_PCT;
  beforeEach(() => {
    process.env.SETTLEMENT_MIN_NET_PCT = ORIG_ENV;
  });

  it("env fallback when no columns exist", async () => {
    delete process.env.SETTLEMENT_MIN_NET_PCT;
    const { client } = makeMockClient({ hasDriverCols: false, hasCompanyCols: false });
    const res = await resolveSettlementMinNet(client, IDS.driver, IDS.company);
    expect(res).toMatchObject({ pct: 50, cents: 0, pctSource: "env", centsSource: "env" });
  });

  it("env honors SETTLEMENT_MIN_NET_PCT override", async () => {
    process.env.SETTLEMENT_MIN_NET_PCT = "60";
    const { client } = makeMockClient({ hasDriverCols: false, hasCompanyCols: false });
    const res = await resolveSettlementMinNet(client, IDS.driver, IDS.company);
    expect(res.pct).toBe(60);
  });

  it("per-field independent coalesce — driver.pct + company.cents", async () => {
    const { client } = makeMockClient({
      driverRow: { pct: 70, cents: null },
      companyRow: { pct: 50, cents: 25000 },
    });
    const res = await resolveSettlementMinNet(client, IDS.driver, IDS.company);
    expect(res).toMatchObject({ pct: 70, pctSource: "driver", cents: 25000, centsSource: "company" });
  });

  it("company default used when driver has no override", async () => {
    const { client } = makeMockClient({
      driverRow: { pct: null, cents: null },
      companyRow: { pct: 40, cents: 10000 },
    });
    const res = await resolveSettlementMinNet(client, IDS.driver, IDS.company);
    expect(res).toMatchObject({ pct: 40, pctSource: "company", cents: 10000, centsSource: "company" });
  });
});

describe("applyPendingDeductionsToSettlementWithNetFloor", () => {
  beforeEach(() => {
    vi.mocked(appendCrudAudit).mockClear();
    delete process.env.SETTLEMENT_MIN_NET_PCT;
  });

  it("applies deductions under the cap and stamps applied_to_settlement_id", async () => {
    // gross 100000c, 50% floor => available 50000c
    const { client, updatedDeductionIds, insertedLines } = makeMockClient({
      grossCents: 100000,
      driverRow: { pct: null, cents: null },
      companyRow: { pct: 50, cents: 0 },
      pending: [
        { id: "d1", amount_cents: 20000, reason: "Fuel", deduction_type: "fuel" },
        { id: "d2", amount_cents: 20000, reason: "Damage", deduction_type: "damage" },
      ],
    });

    const res = await applyPendingDeductionsToSettlementWithNetFloor(client, {
      settlementId: IDS.settlement,
      driverId: IDS.driver,
      operatingCompanyId: IDS.company,
      actorUserId: IDS.actor,
    });

    expect(res.appliedCount).toBe(2);
    expect(res.appliedCents).toBe(40000);
    expect(res.deferredCount).toBe(0);
    expect(updatedDeductionIds).toEqual(["d1", "d2"]);
    expect(insertedLines).toHaveLength(2);
    expect(appendCrudAudit).not.toHaveBeenCalled();
  });

  it("all-or-nothing roll-over — defers a deduction that overflows the cap, keeps later smaller ones", async () => {
    // gross 100000c, 50% floor => available 50000c
    const { client, updatedDeductionIds } = makeMockClient({
      grossCents: 100000,
      driverRow: { pct: null, cents: null },
      companyRow: { pct: 50, cents: 0 },
      pending: [
        { id: "d1", amount_cents: 30000, reason: "Big", deduction_type: "damage" }, // applied (30000<=50000)
        { id: "d2", amount_cents: 30000, reason: "Overflow", deduction_type: "equipment" }, // skip (60000>50000)
        { id: "d3", amount_cents: 20000, reason: "Fits", deduction_type: "fuel" }, // applied (50000<=50000)
      ],
    });

    const res = await applyPendingDeductionsToSettlementWithNetFloor(client, {
      settlementId: IDS.settlement,
      driverId: IDS.driver,
      operatingCompanyId: IDS.company,
      actorUserId: IDS.actor,
    });

    expect(res.appliedCount).toBe(2);
    expect(res.appliedCents).toBe(50000);
    expect(res.deferredCount).toBe(1);
    expect(res.deferredCents).toBe(30000);
    expect(updatedDeductionIds).toEqual(["d1", "d3"]);
    expect(appendCrudAudit).toHaveBeenCalledOnce();
    expect(vi.mocked(appendCrudAudit).mock.calls[0]?.[2]).toBe("driver_finance.deduction.deferred_over_cap");
  });

  it("absolute cents floor dominates when higher than pct floor", async () => {
    // gross 100000c, pct floor 10% = 10000c, cents floor 90000c => available 10000c
    const { client, updatedDeductionIds } = makeMockClient({
      grossCents: 100000,
      driverRow: { pct: null, cents: null },
      companyRow: { pct: 10, cents: 90000 },
      pending: [{ id: "d1", amount_cents: 20000, reason: "Too big", deduction_type: "other" }],
    });

    const res = await applyPendingDeductionsToSettlementWithNetFloor(client, {
      settlementId: IDS.settlement,
      driverId: IDS.driver,
      operatingCompanyId: IDS.company,
      actorUserId: IDS.actor,
    });

    expect(res.floorCents).toBe(90000);
    expect(res.availableCents).toBe(10000);
    expect(res.appliedCount).toBe(0);
    expect(res.deferredCount).toBe(1);
    expect(updatedDeductionIds).toEqual([]);
  });

  it("no settlement_lines table — no-op", async () => {
    const { client, updatedDeductionIds } = makeMockClient({
      hasSettlementLines: false,
      pending: [{ id: "d1", amount_cents: 1000, reason: "x", deduction_type: "other" }],
    });
    const res = await applyPendingDeductionsToSettlementWithNetFloor(client, {
      settlementId: IDS.settlement,
      driverId: IDS.driver,
      operatingCompanyId: IDS.company,
      actorUserId: IDS.actor,
    });
    expect(res.appliedCount).toBe(0);
    expect(updatedDeductionIds).toEqual([]);
  });
});
