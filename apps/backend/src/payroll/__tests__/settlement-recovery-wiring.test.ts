import { describe, expect, it, vi } from "vitest";

// Mock the three resolver imports so buildDraftLines' own client.query mock drives the logic.
vi.mock("../../accounting/coa-roles/resolver.service.js", () => ({
  resolveRoleAccount: vi.fn(async (_c: unknown, _o: string, role: string) =>
    role === "expense_default" ? "expense-acct" : "ap-acct"
  ),
}));
vi.mock("../../driver-finance/settlement-deduction-cap.service.js", () => ({
  resolveSettlementMinNet: vi.fn(async () => ({ pct: 50, cents: 0, pctSource: "env", centsSource: "env" })),
}));
vi.mock("../../accounting/expense-category-map/resolver.service.js", () => ({
  resolveAccountForCategory: vi.fn(async () => ({ account_id: "qbo-149", posting_side: "debit" })),
}));

const { buildDraftLines } = await import("../driver-settlement.service.js");

type MakeOpts = {
  flagOn: boolean;
  loadsGross: number[];
  bluntSumCents?: number;
  pending?: { id: string; amount_cents: string; remaining_balance_cents: string | null; deduction_type: string }[];
};
function makeClient(opts: MakeOpts) {
  const sqls: string[] = [];
  const client = {
    query: vi.fn(async (sql: string) => {
      sqls.push(sql);
      if (sql.includes("feature_flags")) return { rows: [{ default_enabled: opts.flagOn }] };
      if (sql.includes("FROM mdata.loads")) {
        return { rows: opts.loadsGross.map((g, i) => ({ load_id: `L${i}`, load_number: `LN${i}`, gross_amount_cents: String(g) })) };
      }
      if (sql.includes("FROM driver_finance.cash_advance_requests")) {
        return { rows: [{ deductions_cents: String(opts.bluntSumCents ?? 0) }] };
      }
      if (sql.includes("FROM driver_finance.driver_settlement_deductions")) return { rows: opts.pending ?? [] };
      return { rows: [] };
    }),
  };
  return { client, sqls };
}
const INPUT = { operatingCompanyId: "oc", driverId: "drv", periodStart: "2026-06-01", periodEnd: "2026-06-30" };

describe("A3-2 wiring — flag OFF is byte-identical to the legacy blunt path", () => {
  it("recovers the full in-period approved sum (no floor, no cap), recoveryPlan null", async () => {
    const { client } = makeClient({ flagOn: false, loadsGross: [100000], bluntSumCents: 150000 });
    const r = await buildDraftLines(client as never, INPUT);
    const recovery = r.lines.find((l) => l.line_type === "advance_recovery");
    expect(recovery).toMatchObject({ amount_cents: -150000, posting_account_id: "ap-acct", description: "Cash advance recovery" });
    expect(r.recoveryPlan).toBeNull();
  });

  it("emits no recovery line when there are no in-period approved advances", async () => {
    const { client } = makeClient({ flagOn: false, loadsGross: [100000], bluntSumCents: 0 });
    const r = await buildDraftLines(client as never, INPUT);
    expect(r.lines.some((l) => l.line_type === "advance_recovery")).toBe(false);
    expect(r.recoveryPlan).toBeNull();
  });
});

describe("A3-2 wiring — flag ON uses the capped ledger engine", () => {
  it("recovers down to the 50% floor, marks partial, credits the QBO-149 asset", async () => {
    const { client, sqls } = makeClient({
      flagOn: true,
      loadsGross: [100000],
      pending: [{ id: "d1", amount_cents: "150000", remaining_balance_cents: null, deduction_type: "cash_advance_repayment" }],
    });
    const r = await buildDraftLines(client as never, INPUT);
    const recovery = r.lines.find((l) => l.line_type === "advance_recovery");
    expect(recovery).toMatchObject({ amount_cents: -50000, posting_account_id: "qbo-149" }); // gross 100000 - floor 50000
    expect(r.recoveryPlan?.allocations[0]).toMatchObject({ recovered_cents: 50000, new_remaining_cents: 100000, new_status: "partial" });
    // escrow is excluded at the query level
    const pendingSql = sqls.find((s) => s.includes("FROM driver_finance.driver_settlement_deductions")) ?? "";
    expect(pendingSql).toContain("deduction_type = 'cash_advance_repayment'");
    expect(pendingSql).toContain("status IN ('pending', 'partial', 'deferred')");
  });

  it("never drives net negative even when the advance dwarfs gross", async () => {
    const { client } = makeClient({
      flagOn: true,
      loadsGross: [40000],
      pending: [{ id: "d1", amount_cents: "999999", remaining_balance_cents: "999999", deduction_type: "cash_advance_repayment" }],
    });
    const r = await buildDraftLines(client as never, INPUT);
    const recovered = -(r.lines.find((l) => l.line_type === "advance_recovery")?.amount_cents ?? 0);
    expect(recovered).toBe(20000); // floor = 50% of 40000
    expect(40000 - recovered).toBeGreaterThanOrEqual(20000);
  });
});
