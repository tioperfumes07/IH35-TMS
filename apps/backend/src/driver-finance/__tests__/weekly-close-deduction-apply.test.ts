import { describe, expect, it, vi } from "vitest";

// Landmine regression coverage (weekly-close): apps/backend/src/driver-finance/weekly-close.routes.ts
// used to INSERT deductions_total=0 / reimbursements_total=0 / net_pay=grossPay unconditionally, so a
// driver with pending deductions was always drafted at full gross pay. The fix reuses the SAME canonical
// helpers the load-bookended close uses (applyPendingDeductionsToSettlementWithNetFloor,
// computeSettlementReimbursements, aggregateSettlementTotals), gated behind the SAME per-entity
// SETTLEMENT_DEDUCTION_APPLY_ENABLED flag. This test drives the extracted per-driver unit
// (closeWeeklySettlementDraftForDriver) against a stateful mock client — real business-logic functions,
// no new GL/deduction math introduced.

vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn().mockResolvedValue(undefined),
}));

import { closeWeeklySettlementDraftForDriver } from "../weekly-close.routes.js";

const IDS = {
  company: "0c000000-0000-0000-0000-000000000002",
  driver: "d5100000-0000-0000-0000-000000000002",
  actor: "05e50000-0000-0000-0000-000000000002",
  settlement: "5e100000-0000-0000-0000-000000000002",
  bill: "b1110000-0000-0000-0000-000000000002",
};

type Line = { line_type: string; amount: number };
type Deduction = { id: string; amount_cents: number; reason: string; deduction_type: string; applied: boolean };

type State = {
  lines: Line[];
  deductions: Deduction[];
  flagOn: boolean;
  aggregate: { gross: number; deductions: number; reimbursements: number; net: number } | null;
  callLog: string[];
};

function makeState(opts: { flagOn: boolean; deductions?: Deduction[] }): State {
  return {
    lines: [],
    deductions: opts.deductions ?? [],
    flagOn: opts.flagOn,
    aggregate: null,
    callLog: [],
  };
}

function makeMockClient(state: State) {
  return {
    async query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: T[] }> {
      const rows = <R>(r: R[]) => ({ rows: r as unknown as T[] });

      // Driver bills for the period — one $1000 bill.
      if (sql.includes("FROM driver_finance.driver_bills") || sql.includes("dedupe_key")) {
        return rows([
          {
            id: IDS.bill,
            load_number: "L-9002",
            bill_number: "B-L-9002",
            gross_amount_cents: 100000,
            miles_basis: null,
            miles_basis_type: null,
            rate_per_mile_cents: null,
            notes: null,
          },
        ]);
      }

      if (sql.includes("next_settlement_display_id")) return rows([{ next_id: "S-2026-9002" }]);

      if (sql.includes("INSERT INTO driver_finance.driver_settlements")) {
        state.callLog.push("settlement_insert");
        return rows([{ id: IDS.settlement }]);
      }

      if (sql.includes("INSERT INTO driver_finance.settlement_lines") && sql.includes("'earnings'")) {
        const amount = Number(values?.[2] ?? 0);
        state.lines.push({ line_type: "earnings", amount });
        state.callLog.push("earnings_line_insert");
        return rows([{ id: `line-${state.lines.length}` }]);
      }

      // feature flag resolver
      if (sql.includes("FROM lib.feature_flags")) {
        return rows([{ flag_key: "SETTLEMENT_DEDUCTION_APPLY_ENABLED", description: null, default_enabled: false, rollout_pct: 0 }]);
      }
      if (sql.includes("FROM lib.feature_flag_overrides")) {
        state.callLog.push("flag_overrides_read");
        return state.flagOn
          ? rows([
              {
                uuid: "ov",
                flag_key: "SETTLEMENT_DEDUCTION_APPLY_ENABLED",
                operating_company_id: IDS.company,
                user_uuid: null,
                enabled: true,
                set_by_user_uuid: IDS.actor,
                set_at: "now",
                expires_at: null,
              },
            ])
          : rows([]);
      }

      // computeSettlementReimbursements — no pending reimbursements in this fixture.
      if (sql.includes("FROM driver_finance.driver_reimbursements") && sql.includes("pay_mode = 'settlement'")) {
        return rows([]);
      }

      // applyPendingDeductionsToSettlementWithNetFloor
      if (sql.includes("to_regclass('driver_finance.settlement_lines')")) return rows([{ ok: true }]);
      if (sql.includes("gross_cents") && sql.includes("FROM driver_finance.settlement_lines")) {
        const gross = state.lines
          .filter((l) => ["earnings", "extra_pay", "team_split_primary", "team_split_secondary"].includes(l.line_type))
          .reduce((a, l) => a + l.amount, 0);
        return rows([{ gross_cents: Math.round(gross * 100) }]);
      }
      if (sql.includes("FROM information_schema.columns")) {
        const schema = String(values?.[0] ?? "");
        return rows([{ ok: schema !== "mdata" }]);
      }
      if (sql.includes("FROM mdata.drivers") && sql.includes("min_net_settlement_pct")) return rows([{ pct: null, cents: null }]);
      if (sql.includes("FROM org.companies") && sql.includes("min_net_settlement_pct")) return rows([{ pct: 5, cents: 0 }]);
      if (sql.includes("FROM driver_finance.driver_settlement_deductions") && sql.includes("applied_to_settlement_id IS NULL")) {
        state.callLog.push("pending_deductions_read");
        return rows(
          state.deductions
            .filter((d) => !d.applied)
            .map((d) => ({ id: d.id, amount_cents: d.amount_cents, reason: d.reason, deduction_type: d.deduction_type }))
        );
      }
      if (sql.includes("INSERT INTO driver_finance.settlement_lines") && sql.includes("'deduction'")) {
        const amount = Number(values?.[2] ?? 0);
        state.lines.push({ line_type: "deduction", amount });
        state.callLog.push("deduction_line_insert");
        return rows([{ id: `line-${state.lines.length}` }]);
      }
      if (sql.includes("UPDATE driver_finance.driver_settlement_deductions")) {
        const id = String(values?.[0] ?? "");
        const d = state.deductions.find((x) => x.id === id);
        if (d) d.applied = true;
        return rows([]);
      }

      // aggregateSettlementTotals
      if (sql.includes("SUM(CASE WHEN line_type") && sql.includes("AS earnings")) {
        const earnings = state.lines
          .filter((l) => ["earnings", "extra_pay", "team_split_primary", "team_split_secondary"].includes(l.line_type))
          .reduce((a, l) => a + l.amount, 0);
        const deductions = state.lines
          .filter((l) => ["deduction", "abandonment_chargeback"].includes(l.line_type))
          .reduce((a, l) => a + l.amount, 0);
        const reimbursements = state.lines.filter((l) => l.line_type === "reimbursement").reduce((a, l) => a + l.amount, 0);
        return rows([{ earnings, deductions, reimbursements }]);
      }
      if (sql.includes("UPDATE driver_finance.driver_settlements") && sql.includes("gross_pay = $2")) {
        state.callLog.push("aggregate_write");
        state.aggregate = {
          gross: Number(values?.[1]),
          deductions: Number(values?.[2]),
          reimbursements: Number(values?.[3]),
          net: Number(values?.[4]),
        };
        return rows([]);
      }

      return rows([]);
    },
  };
}

describe("closeWeeklySettlementDraftForDriver — deduction applier wiring (weekly-close landmine fix)", () => {
  it("flag OFF — no deductions applied; net pay == gross (documented current-behavior parity, honest skip audit)", async () => {
    const state = makeState({
      flagOn: false,
      deductions: [{ id: "adv1", amount_cents: 20000, reason: "Cash advance", deduction_type: "cash_advance_repayment", applied: false }],
    });
    const client = makeMockClient(state);

    const result = await closeWeeklySettlementDraftForDriver(client, {
      operatingCompanyId: IDS.company,
      driverId: IDS.driver,
      weekStart: "2026-05-10",
      weekEnd: "2026-05-16",
      actorUserId: IDS.actor,
    });

    expect(result?.draftSettlementId).toBe(IDS.settlement);
    expect(state.callLog).not.toContain("pending_deductions_read");
    expect(state.callLog).not.toContain("deduction_line_insert");
    expect(state.aggregate).toEqual({ gross: 1000, deductions: 0, reimbursements: 0, net: 1000 });
  });

  it("flag ON — deductions present → net pay reduced below gross (landmine fixed)", async () => {
    // Gross $1000, 5% floor => $50 floor, $950 available. $200 pending deduction applies fully.
    const state = makeState({
      flagOn: true,
      deductions: [{ id: "adv1", amount_cents: 20000, reason: "Cash advance", deduction_type: "cash_advance_repayment", applied: false }],
    });
    const client = makeMockClient(state);

    const result = await closeWeeklySettlementDraftForDriver(client, {
      operatingCompanyId: IDS.company,
      driverId: IDS.driver,
      weekStart: "2026-05-10",
      weekEnd: "2026-05-16",
      actorUserId: IDS.actor,
    });

    expect(result?.draftSettlementId).toBe(IDS.settlement);
    // Deduction applier + aggregate BOTH ran, in the correct order (apply before recompute).
    expect(state.callLog).toContain("pending_deductions_read");
    expect(state.callLog).toContain("deduction_line_insert");
    expect(state.callLog.indexOf("deduction_line_insert")).toBeLessThan(state.callLog.indexOf("aggregate_write"));
    expect(state.deductions[0]!.applied).toBe(true);

    // The core regression assertion: net pay is now LESS than gross pay.
    expect(state.aggregate).not.toBeNull();
    expect(state.aggregate!.net).toBeLessThan(state.aggregate!.gross);
    expect(state.aggregate).toEqual({ gross: 1000, deductions: 200, reimbursements: 0, net: 800 });
  });

  it("flag ON — no pending deductions → net pay still equals gross (no false deduction invented)", async () => {
    const state = makeState({ flagOn: true, deductions: [] });
    const client = makeMockClient(state);

    const result = await closeWeeklySettlementDraftForDriver(client, {
      operatingCompanyId: IDS.company,
      driverId: IDS.driver,
      weekStart: "2026-05-10",
      weekEnd: "2026-05-16",
      actorUserId: IDS.actor,
    });

    expect(result?.draftSettlementId).toBe(IDS.settlement);
    expect(state.callLog).toContain("pending_deductions_read");
    expect(state.callLog).not.toContain("deduction_line_insert");
    expect(state.aggregate).toEqual({ gross: 1000, deductions: 0, reimbursements: 0, net: 1000 });
  });
});
