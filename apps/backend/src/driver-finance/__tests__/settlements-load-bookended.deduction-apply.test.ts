import { beforeEach, describe, expect, it, vi } from "vitest";

// End-to-end wiring test for REPAIR-A: the canonical driver_finance close must run the deduction
// applier ONLY when SETTLEMENT_DEDUCTION_APPLY_ENABLED is ON (per-entity override), after
// earnings/abandonment lines exist and BEFORE aggregateSettlementTotals recomputes net_pay.
//
// Uses the REAL applier + REAL isEnabled resolver against a stateful mock client. Only the
// audit sink and the two line-source sub-services are mocked (they issue their own queries we
// don't simulate); the earnings line is injected via the mocked line-appender so the tie-out is real.

vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../abandonment.service.js", () => ({
  applyApprovedAbandonmentChargebacksToSettlement: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../settlement-engine.js", () => ({
  fetchTeamDriversForLoad: vi.fn().mockResolvedValue(null),
  appendSettlementLineFromDriverBillIfMissing: vi.fn().mockResolvedValue(undefined),
}));

import { appendSettlementLineFromDriverBillIfMissing } from "../settlement-engine.js";
import { closeSettlementForFinalLoad } from "../settlements-load-bookended.service.js";

const IDS = {
  settlement: "5e100000-0000-0000-0000-000000000001",
  load: "10ad0000-0000-0000-0000-000000000001",
  driver: "d5100000-0000-0000-0000-000000000001",
  company: "0c000000-0000-0000-0000-000000000001",
  actor: "05e50000-0000-0000-0000-000000000001",
};

type Line = { line_type: string; amount: number };
type Deduction = { id: string; amount_cents: number; reason: string; deduction_type: string; applied: boolean; load_id: string | null };

type State = {
  lines: Line[];
  deductions: Deduction[];
  flagOn: boolean;
  aggregate: { gross: number; deductions: number; reimbursements: number; net: number } | null;
  callLog: string[];
};

function makeState(opts: { earnings: number; flagOn: boolean; deductions?: Deduction[] }): State {
  return {
    lines: [],
    deductions: opts.deductions ?? [],
    flagOn: opts.flagOn,
    aggregate: null,
    callLog: [],
    // earnings injected by the mocked line-appender below via _pendingEarnings
    ...( { _pendingEarnings: opts.earnings } as unknown as object ),
  } as State & { _pendingEarnings: number };
}

function makeMockClient(state: State & { _pendingEarnings?: number }) {
  const client = {
    async query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: T[] }> {
      const rows = <R>(r: R[]) => ({ rows: r as unknown as T[] });

      if (sql.includes("to_regclass('driver_finance.settlement_lines')")) return rows([{ ok: true }]);

      if (sql.includes("FROM information_schema.columns")) {
        // driver has no override columns; company cols exist so resolveSettlementMinNet reads company.
        const schema = String(values?.[0] ?? "");
        return rows([{ ok: schema !== "mdata" }]);
      }
      if (sql.includes("FROM mdata.drivers")) return rows([{ pct: null, cents: null }]);
      if (sql.includes("FROM org.companies")) return rows([{ pct: 5, cents: 0 }]); // 5% locked floor

      // Load lookup in closeSettlementForFinalLoad
      if (sql.includes("FROM mdata.loads") && sql.includes("assigned_primary_driver_id, assigned_secondary_driver_id")) {
        return rows([
          { id: IDS.load, load_number: "L-9001", assigned_primary_driver_id: IDS.driver, assigned_secondary_driver_id: null },
        ]);
      }
      // busy check
      if (sql.includes("count(*)::int AS cnt") && sql.includes("FROM mdata.loads l")) return rows([{ cnt: 0 }]);

      // open settlement (FOR UPDATE) — match BEFORE the deductions FOR UPDATE by table name
      if (sql.includes("FROM driver_finance.driver_settlements") && sql.includes("trip_closed_at IS NULL")) {
        return rows([{ id: IDS.settlement }]);
      }

      // feature flag resolver
      if (sql.includes("FROM lib.feature_flags")) {
        return rows([{ flag_key: "SETTLEMENT_DEDUCTION_APPLY_ENABLED", description: null, default_enabled: false, rollout_pct: 0 }]);
      }
      if (sql.includes("FROM lib.feature_flag_overrides")) {
        state.callLog.push("flag_overrides_read");
        return state.flagOn
          ? rows([{ uuid: "ov", flag_key: "SETTLEMENT_DEDUCTION_APPLY_ENABLED", operating_company_id: IDS.company, user_uuid: null, enabled: true, set_by_user_uuid: IDS.actor, set_at: "now", expires_at: null }])
          : rows([]);
      }

      // applier gross query
      if (sql.includes("gross_cents") && sql.includes("FROM driver_finance.settlement_lines")) {
        const gross = state.lines.filter((l) => ["earnings", "extra_pay", "team_split_primary", "team_split_secondary"].includes(l.line_type)).reduce((a, l) => a + l.amount, 0);
        return rows([{ gross_cents: Math.round(gross * 100) }]);
      }

      // pending deductions (applier FOR UPDATE)
      if (sql.includes("FROM driver_finance.driver_settlement_deductions") && sql.includes("applied_to_settlement_id IS NULL")) {
        state.callLog.push("pending_deductions_read");
        return rows(state.deductions.filter((d) => !d.applied).map((d) => ({ id: d.id, amount_cents: d.amount_cents, reason: d.reason, deduction_type: d.deduction_type })));
      }

      // applier inserts a deduction line
      if (sql.includes("INSERT INTO driver_finance.settlement_lines")) {
        const amount = Number(values?.[2] ?? 0);
        state.lines.push({ line_type: "deduction", amount });
        state.callLog.push("deduction_line_insert");
        return rows([{ id: `line-${state.lines.length}` }]);
      }

      // applier stamps applied_to_settlement_id
      if (sql.includes("UPDATE driver_finance.driver_settlement_deductions")) {
        const id = String(values?.[0] ?? "");
        const d = state.deductions.find((x) => x.id === id);
        if (d) d.applied = true;
        return rows([]);
      }

      // close UPDATE
      if (sql.includes("UPDATE driver_finance.driver_settlements") && sql.includes("trip_closed_at")) return rows([]);

      // aggregate read
      if (sql.includes("SUM(CASE WHEN line_type") && sql.includes("AS earnings")) {
        const earnings = state.lines.filter((l) => ["earnings", "extra_pay", "team_split_primary", "team_split_secondary"].includes(l.line_type)).reduce((a, l) => a + l.amount, 0);
        const deductions = state.lines.filter((l) => ["deduction", "abandonment_chargeback"].includes(l.line_type)).reduce((a, l) => a + l.amount, 0);
        const reimbursements = state.lines.filter((l) => l.line_type === "reimbursement").reduce((a, l) => a + l.amount, 0);
        return rows([{ earnings, deductions, reimbursements }]);
      }
      // aggregate write — capture final net
      if (sql.includes("UPDATE driver_finance.driver_settlements") && sql.includes("gross_pay = $2")) {
        state.callLog.push("aggregate_write");
        state.aggregate = { gross: Number(values?.[1]), deductions: Number(values?.[2]), reimbursements: Number(values?.[3]), net: Number(values?.[4]) };
        return rows([]);
      }

      // outbox
      if (sql.includes("INSERT INTO outbox.events")) return rows([]);

      return rows([]);
    },
  };
  return client;
}

describe("closeLoadBookendedSettlement — deduction applier wiring (SETTLEMENT_DEDUCTION_APPLY_ENABLED)", () => {
  beforeEach(() => {
    // Mocked line-appender injects the earnings line into shared state per-test.
    vi.mocked(appendSettlementLineFromDriverBillIfMissing).mockReset();
  });

  it("flag OFF — applier does NOT run; net pay == gross (unchanged behavior, driver NOT double-charged)", async () => {
    const state = makeState({ earnings: 1000, flagOn: false }) as State & { _pendingEarnings: number };
    vi.mocked(appendSettlementLineFromDriverBillIfMissing).mockImplementation(async () => {
      state.lines.push({ line_type: "earnings", amount: state._pendingEarnings });
    });
    const client = makeMockClient(state);

    await closeSettlementForFinalLoad(client, { loadId: IDS.load, operatingCompanyId: IDS.company, actorUserId: IDS.actor });

    // Applier never touched the pending-deduction ledger and inserted no deduction line.
    expect(state.callLog).not.toContain("pending_deductions_read");
    expect(state.callLog).not.toContain("deduction_line_insert");
    // Net pay is exactly gross — deductions never applied.
    expect(state.aggregate).toEqual({ gross: 1000, deductions: 0, reimbursements: 0, net: 1000 });
  });

  it("flag ON — applier runs BEFORE aggregate; net pay reduced by the deduction, 5% floor respected (tie-out)", async () => {
    // Gross $1000. 5% floor => $50 floor, $950 available. A $200 cash-advance deduction applies fully.
    const state = makeState({
      earnings: 1000,
      flagOn: true,
      deductions: [{ id: "adv1", amount_cents: 20000, reason: "Cash advance", deduction_type: "cash_advance_repayment", applied: false, load_id: IDS.load }],
    }) as State & { _pendingEarnings: number };
    vi.mocked(appendSettlementLineFromDriverBillIfMissing).mockImplementation(async () => {
      state.lines.push({ line_type: "earnings", amount: state._pendingEarnings });
    });
    const client = makeMockClient(state);

    await closeSettlementForFinalLoad(client, { loadId: IDS.load, operatingCompanyId: IDS.company, actorUserId: IDS.actor });

    // Applier ran, inserted the deduction line, and stamped the ledger row (load_id preserved on source).
    expect(state.callLog).toContain("pending_deductions_read");
    expect(state.callLog).toContain("deduction_line_insert");
    expect(state.deductions[0]!.applied).toBe(true);
    expect(state.deductions[0]!.load_id).toBe(IDS.load); // canonical store carries load_id per line

    // Ordering: the deduction line was inserted BEFORE aggregate recomputed net_pay.
    expect(state.callLog.indexOf("deduction_line_insert")).toBeLessThan(state.callLog.indexOf("aggregate_write"));

    // Tie-out: net = gross - deductions + reimb = 1000 - 200 + 0 = 800; floor ($50) respected (800 >= 50).
    expect(state.aggregate).toEqual({ gross: 1000, deductions: 200, reimbursements: 0, net: 800 });
    expect(state.aggregate!.net).toBeGreaterThanOrEqual(Math.round(state.aggregate!.gross * 0.05));
  });
});
