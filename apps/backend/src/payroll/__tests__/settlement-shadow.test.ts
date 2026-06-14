import { describe, expect, it, vi } from "vitest";

vi.mock("../../driver-finance/settlement-deduction-cap.service.js", () => ({
  resolveSettlementMinNet: vi.fn(async () => ({ pct: 50, cents: 0, pctSource: "env", centsSource: "env" })),
}));

const { classifyRecoveryDifference, runSettlementShadow } = await import("../settlement-shadow.service.js");

describe("A3-3 classifyRecoveryDifference", () => {
  const base = { grossCents: 100000, floorCents: 50000 };
  it("agree when recoveries match", () => {
    expect(classifyRecoveryDifference({ ...base, oldRecoveryCents: 30000, newRecoveryCents: 30000 })).toBe("agree");
  });
  it("(a) new recovers less because old breached the floor / went negative", () => {
    // old recovers 150000 on 100000 gross -> old net -50000 (< floor); new caps at floor (50000)
    expect(classifyRecoveryDifference({ ...base, oldRecoveryCents: 150000, newRecoveryCents: 50000 })).toBe("a_avoids_below_floor");
  });
  it("(b) new recovers more — picking up an advance the old in-window sum leaked", () => {
    expect(classifyRecoveryDifference({ ...base, oldRecoveryCents: 30000, newRecoveryCents: 50000 })).toBe("b_recovers_leaked");
  });
  it("(c) unexplained when new < old but old did NOT breach the floor (must be 0 in real data)", () => {
    expect(classifyRecoveryDifference({ ...base, oldRecoveryCents: 30000, newRecoveryCents: 20000 })).toBe("c_unexplained");
  });
});

describe("A3-3 runSettlementShadow — read-only, computes both paths", () => {
  function makeClient() {
    const sqls: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        sqls.push(sql);
        if (sql.includes("FROM payroll.driver_settlements")) {
          return { rows: [{ id: "s1", driver_id: "d1", gross_cents: "100000" }] };
        }
        if (sql.includes("FROM driver_finance.cash_advance_requests")) return { rows: [{ deductions_cents: "150000" }] };
        if (sql.includes("FROM driver_finance.driver_settlement_deductions")) {
          return { rows: [{ id: "x1", amount_cents: "150000", remaining_balance_cents: null, deduction_type: "cash_advance_repayment" }] };
        }
        return { rows: [] };
      }),
    };
    return { client, sqls };
  }

  it("classifies a leaky/negative old path as (a) and writes NOTHING", async () => {
    const { client, sqls } = makeClient();
    const report = await runSettlementShadow(client as never, {
      operatingCompanyId: "oc",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
    });
    const row = report.settlements[0];
    expect(row).toMatchObject({
      gross_cents: 100000,
      old_recovery_cents: 150000, // blunt full sum
      new_recovery_cents: 50000, // capped to floor (50% of 100000)
      old_net_cents: -50000, // old would cut a NEGATIVE check
      new_net_cents: 50000, // new respects the floor
      floor_cents: 50000,
      category: "a_avoids_below_floor",
    });
    expect(report.summary).toMatchObject({ compared: 1, agree: 0, a_avoids_below_floor: 1, b_recovers_leaked: 0, c_unexplained: 0 });
    // PURE READ: no settlement/ledger/GL writes in shadow mode.
    expect(sqls.some((s) => /\b(INSERT|UPDATE|DELETE)\b/i.test(s))).toBe(false);
  });
});
