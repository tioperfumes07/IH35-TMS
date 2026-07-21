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
type Deduction = { id: string; amount_cents: number; reason: string; deduction_type: string; applied: boolean; load_id: string | null; policy_id?: string };
type AutoPolicy = {
  id: string;
  deduction_type: string;
  total_owed_cents: number;
  deducted_so_far_cents: number;
  max_per_settlement_cents: number;
  memo: string | null;
  status: string;
};

type State = {
  lines: Line[];
  deductions: Deduction[];
  autoPolicies: AutoPolicy[];
  flagOn: boolean;
  aggregate: { gross: number; deductions: number; reimbursements: number; net: number } | null;
  callLog: string[];
};

function makeState(opts: { earnings: number; flagOn: boolean; deductions?: Deduction[]; autoPolicies?: AutoPolicy[] }): State {
  return {
    lines: [],
    deductions: opts.deductions ?? [],
    autoPolicies: opts.autoPolicies ?? [],
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

      // P2a materializer schema probe (checked BEFORE the generic information_schema branch —
      // the probe SQL also contains "FROM information_schema.columns").
      if (sql.includes("to_regclass('driver_finance.driver_settlement_deductions')")) {
        return rows([{ table_ok: true, column_ok: true }]);
      }
      // P2a materializer: active-policy read (FOR UPDATE)
      if (sql.includes("FROM driver_finance.auto_deduction_policies")) {
        state.callLog.push("auto_policies_read");
        return rows(
          state.autoPolicies
            .filter((p) => p.status === "active" && p.deducted_so_far_cents < p.total_owed_cents)
            .map((p) => ({ ...p }))
        );
      }
      // P2a materializer: sub-ledger tranche insert (ON CONFLICT one-open-tranche arbiter simulated)
      if (sql.includes("INSERT INTO driver_finance.driver_settlement_deductions")) {
        const policyId = String(values?.[5] ?? "");
        if (state.deductions.some((d) => d.policy_id === policyId && !d.applied)) return rows([]);
        const id = `auto-${state.deductions.length + 1}`;
        state.deductions.push({
          id,
          amount_cents: Number(values?.[3] ?? 0),
          reason: String(values?.[4] ?? ""),
          deduction_type: String(values?.[2] ?? ""),
          applied: false,
          load_id: null,
          policy_id: policyId,
        });
        state.callLog.push("auto_tranche_insert");
        return rows([{ id }]);
      }
      // P2a materializer: policy progress update
      if (sql.includes("UPDATE driver_finance.auto_deduction_policies")) {
        const policy = state.autoPolicies.find((p) => p.id === String(values?.[0] ?? ""));
        if (policy) {
          policy.deducted_so_far_cents = Number(values?.[1] ?? 0);
          if (values?.[2] === true) policy.status = "completed";
        }
        state.callLog.push("auto_policy_update");
        return rows([]);
      }

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

  it("P2a flag ON — auto-policy tranche is MATERIALIZED into the sub-ledger BEFORE the cap applier, which applies it (ordering + tie-out)", async () => {
    // Gross $1000, 5% floor => $950 available. Auto policy: $500 owed, $200/settlement max.
    const state = makeState({
      earnings: 1000,
      flagOn: true,
      autoPolicies: [
        { id: "pol-1", deduction_type: "repair", total_owed_cents: 50000, deducted_so_far_cents: 0, max_per_settlement_cents: 20000, memo: "WO-22", status: "active" },
      ],
    }) as State & { _pendingEarnings: number };
    vi.mocked(appendSettlementLineFromDriverBillIfMissing).mockImplementation(async () => {
      state.lines.push({ line_type: "earnings", amount: state._pendingEarnings });
    });
    const client = makeMockClient(state);

    await closeSettlementForFinalLoad(client, { loadId: IDS.load, operatingCompanyId: IDS.company, actorUserId: IDS.actor });

    // Ordering: materializer inserted the tranche BEFORE the cap applier read pending deductions,
    // and both ran BEFORE aggregate recomputed net_pay.
    expect(state.callLog.indexOf("auto_tranche_insert")).toBeGreaterThanOrEqual(0);
    expect(state.callLog.indexOf("auto_tranche_insert")).toBeLessThan(state.callLog.indexOf("pending_deductions_read"));
    expect(state.callLog.indexOf("pending_deductions_read")).toBeLessThan(state.callLog.indexOf("aggregate_write"));

    // The cap applier SAW and applied the auto tranche (cents sub-ledger row → positive deduction line).
    expect(state.deductions).toHaveLength(1);
    expect(state.deductions[0]).toMatchObject({ policy_id: "pol-1", amount_cents: 20000, applied: true });
    expect(state.deductions[0]!.reason).toBe("Auto-deduction (repair): WO-22");

    // Policy counter advanced at materialization.
    expect(state.autoPolicies[0]!.deducted_so_far_cents).toBe(20000);

    // Tie-out: net = 1000 - 200 = 800, floor respected.
    expect(state.aggregate).toEqual({ gross: 1000, deductions: 200, reimbursements: 0, net: 800 });
  });

  it("P2a flag ON — the net-floor cap now GOVERNS autos: an over-cap auto tranche is deferred, net pay NOT pushed below the floor", async () => {
    // Gross $100, 5% floor => $95 available. Auto tranche $200 > $95 → the cap applier defers it.
    // (Pre-P2a this was the financial hole: negative auto lines bypassed the cap entirely.)
    const state = makeState({
      earnings: 100,
      flagOn: true,
      autoPolicies: [
        { id: "pol-1", deduction_type: "cash_advance", total_owed_cents: 50000, deducted_so_far_cents: 0, max_per_settlement_cents: 20000, memo: null, status: "active" },
      ],
    }) as State & { _pendingEarnings: number };
    vi.mocked(appendSettlementLineFromDriverBillIfMissing).mockImplementation(async () => {
      state.lines.push({ line_type: "earnings", amount: state._pendingEarnings });
    });
    const client = makeMockClient(state);

    await closeSettlementForFinalLoad(client, { loadId: IDS.load, operatingCompanyId: IDS.company, actorUserId: IDS.actor });

    // Tranche materialized but DEFERRED over cap: stays open in the sub-ledger (rolls to next settlement).
    expect(state.callLog).toContain("auto_tranche_insert");
    expect(state.callLog).toContain("pending_deductions_read");
    expect(state.callLog).not.toContain("deduction_line_insert");
    expect(state.deductions).toHaveLength(1);
    expect(state.deductions[0]!.applied).toBe(false);

    // Net pay untouched — the driver is NOT pushed below the floor by the auto policy.
    expect(state.aggregate).toEqual({ gross: 100, deductions: 0, reimbursements: 0, net: 100 });
  });
});
