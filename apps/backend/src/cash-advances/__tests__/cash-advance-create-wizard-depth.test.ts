import { describe, expect, it, vi } from "vitest";

vi.mock("../display-id.js", () => ({ nextCashAdvanceDisplayId: vi.fn(async () => "CA-1") }));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn() }));

const {
  createDriverCashAdvanceCore,
  resolveEconomicRouting,
  resolveRepaymentSchedule,
} = await import("../cash-advance-create.js");

const ACTOR = "22222222-2222-4222-8222-222222222222";
const OPCO = "11111111-1111-4111-8111-111111111111";
const DRIVER = "33333333-3333-4333-8333-333333333333";
const LOAD = "44444444-4444-4444-8444-444444444444";
const UNIT = "55555555-5555-4555-8555-555555555555";
const BANK = "66666666-6666-4666-8666-666666666666";

describe("resolveEconomicRouting", () => {
  it("routes lumper to load_expense", () => {
    expect(resolveEconomicRouting("lumper")).toBe("load_expense");
  });
  it("routes personal/fuel to driver_settlement", () => {
    expect(resolveEconomicRouting("family_emergency")).toBe("driver_settlement");
    expect(resolveEconomicRouting("fuel_deposit")).toBe("driver_settlement");
  });
  it("honors explicit override", () => {
    expect(resolveEconomicRouting("lumper", "driver_settlement")).toBe("driver_settlement");
  });
});

describe("resolveRepaymentSchedule", () => {
  it("full mode = single installment of full amount", () => {
    expect(resolveRepaymentSchedule({ amount: 500, recoveryMode: "full" })).toEqual({
      weekly_installment_amount: 500,
      total_periods: 1,
      cadence: "weekly",
    });
  });
  it("amortize uses provided schedule", () => {
    expect(
      resolveRepaymentSchedule({
        amount: 400,
        recoveryMode: "amortize",
        schedule: { weekly_installment_amount: 100, total_periods: 4, cadence: "biweekly" },
      })
    ).toEqual({ weekly_installment_amount: 100, total_periods: 4, cadence: "biweekly" });
  });
});

function makeClient(opts: { wizardCols?: boolean } = {}) {
  const wizardCols = opts.wizardCols ?? true;
  const captured: {
    liabilityBalance: unknown;
    scheduleHeld: boolean | null;
    advanceParams: unknown[] | null;
    sqls: string[];
  } = { liabilityBalance: null, scheduleHeld: null, advanceParams: null, sqls: [] };

  const client = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      captured.sqls.push(sql);
      if (sql.includes("information_schema.columns") && sql.includes("$3")) {
        const col = String(params[2] ?? "");
        if (wizardCols && ["economic_routing", "unit_id", "from_bank_account_id", "load_id"].includes(col)) {
          return { rows: [{ ok: true }] };
        }
        if (col === "load_id") return { rows: [{ ok: true }] };
        return { rows: [{ ok: false }] };
      }
      if (sql.includes("information_schema.columns")) return { rows: [{ ok: false }] };
      if (sql.includes("FROM mdata.drivers")) return { rows: [{ id: params[0], status: "active" }] };
      if (sql.includes("FROM mdata.loads")) return { rows: [{ id: params[0], assigned_unit_id: UNIT }] };
      if (sql.includes("FROM banking.bank_accounts")) return { rows: [{ id: params[0] }] };
      if (sql.includes("INSERT INTO driver_finance.driver_liabilities")) {
        captured.liabilityBalance = params[5];
        return { rows: [{ id: "liab-1" }] };
      }
      if (sql.includes("INSERT INTO driver_finance.deduction_schedule")) {
        captured.scheduleHeld = sql.includes("is_held");
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO driver_finance.driver_advances")) {
        captured.advanceParams = params;
        return { rows: [{ id: "adv-1" }] };
      }
      if (sql.includes("views.cash_advances_with_context")) return { rows: [{ id: "adv-1" }] };
      return { rows: [] };
    }),
  };
  return { client, captured };
}

describe("createDriverCashAdvanceCore — wizard depth", () => {
  it("personal full recovery books driver_settlement with balance = amount", async () => {
    const { client, captured } = makeClient();
    const res = await createDriverCashAdvanceCore(client, ACTOR, OPCO, {
      driver_id: DRIVER,
      amount: 500,
      purpose: "family_emergency",
      disbursement_method: "direct_bank_transfer",
      recipient_info: { recipient_type: "driver", bank_reference: "EFT-REF-0043" },
      from_bank_account_id: BANK,
      recovery_mode: "full",
    });
    expect(res.ok).toBe(true);
    expect(captured.liabilityBalance).toBe(500);
    expect(captured.scheduleHeld).toBe(false);
  });

  it("lumper requires load and routes load_expense with zero balance + held schedule", async () => {
    const { client } = makeClient();
    const missing = await createDriverCashAdvanceCore(client, ACTOR, OPCO, {
      driver_id: DRIVER,
      amount: 150,
      purpose: "lumper",
      disbursement_method: "comdata",
      recipient_info: { recipient_type: "driver" },
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toBe("load_id_required_for_load_expense");

    const { client: c2, captured } = makeClient();
    const ok = await createDriverCashAdvanceCore(c2, ACTOR, OPCO, {
      driver_id: DRIVER,
      amount: 150,
      purpose: "lumper",
      disbursement_method: "direct_bank_transfer",
      // B8 (GO-23 wave 2) — instrument reference is required for every non-in_person_check method.
      recipient_info: { recipient_type: "driver", bank_reference: "EFT-REF-0042" },
      load_id: LOAD,
      unit_id: UNIT,
      from_bank_account_id: BANK,
      economic_routing: "load_expense",
    });
    expect(ok.ok).toBe(true);
    expect(captured.liabilityBalance).toBe(0);
    expect(captured.scheduleHeld).toBe(true);
  });

  it("fuel deposit requires load and unit", async () => {
    const { client } = makeClient();
    const res = await createDriverCashAdvanceCore(client, ACTOR, OPCO, {
      driver_id: DRIVER,
      amount: 200,
      purpose: "fuel_deposit",
      disbursement_method: "wire",
      recipient_info: { recipient_type: "driver" },
      load_id: LOAD,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("fuel_deposit_requires_load_and_unit");
  });
});
