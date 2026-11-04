// ACCT-F11102 — load 13693, owner: "the data you got from the settlement directly is the correct data".
// Driver bill $979.45 = 1,958.9 mi × 50¢; settlement P-0115 line $940.27 = 1,958.9 × 48¢ → the bill follows the settlement.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAudit, mockRelease, mockReaccrue } = vi.hoisted(() => ({ mockAudit: vi.fn(), mockRelease: vi.fn(), mockReaccrue: vi.fn() }));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: mockAudit }));
vi.mock("../driver-pay-restate.service.js", () => ({ releaseDriverPayAccrualInClientTx: mockRelease, reaccrueDriverPayInClientTx: mockReaccrue }));

import { perMilePayCents, repriceDriverBillToSettlementLineInClientTx } from "../driver-bill-reprice-to-settlement.service.js";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const BILL = "75a12be7-8bb2-4cd3-9b12-c023fa5148dc";
const LINE = "541df926-1ba7-453d-8974-6834f331dd20";
const SETTLEMENT = "5ace7732-ed88-4333-a90f-2785c648292c";

function client(o: { accrued?: string | null; posted?: boolean; line?: boolean; gross?: string; status?: string; deadhead?: string } = {}) {
  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes("FROM driver_finance.driver_bills") && sql.includes("FOR UPDATE")) {
        return { rows: [{ id: BILL, load_id: "load-13693", load_number: "13693", status: o.status ?? "open", voided_at: null, team_driver_id: null, miles: "1958.9", rate: 50, gross: o.gross ?? "97945", deadhead: o.deadhead ?? "0", settlement_id: SETTLEMENT, accrued: o.accrued ?? null, accrued_team: null }] };
      }
      if (sql.includes("FROM driver_finance.settlement_lines sl")) return { rows: o.line === false ? [] : [{ id: LINE, amount: "940.27", settlement_id: SETTLEMENT, posted: o.posted ?? false }] };
      if (sql.includes("UPDATE driver_finance.driver_bills")) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }),
  };
}
const input = { operatingCompanyId: OPCO, driverBillId: BILL, settlementLineId: LINE, ratePerMileCents: 48, actorUserId: "owner", reason: 'Owner: "the data you got from the settlement directly is the correct data"', accrue: vi.fn() };

beforeEach(() => {
  for (const m of [mockAudit, mockRelease, mockReaccrue]) m.mockReset();
  mockReaccrue.mockResolvedValue(null);
});

describe("re-price a driver bill to its settlement line (13693)", () => {
  it("1,958.9 mi × 48¢ = 94,027 cents = the settlement line; × 50¢ = 97,945 is the stale bill", () => {
    expect(perMilePayCents(1958.9, 48)).toBe(94027);
    expect(perMilePayCents(1958.9, 50)).toBe(97945);
  });
  it("updates ONLY the driver bill to $940.27 at 48¢ and audits; never touches the settlement line or the driver's rate", async () => {
    const c = client();
    const r = await repriceDriverBillToSettlementLineInClientTx(c as never, input);
    expect(r).toMatchObject({ old_gross_cents: 97945, new_gross_cents: 94027, old_rate_per_mile_cents: 50, new_rate_per_mile_cents: 48, accrual_released: 0 });
    const upd = c.query.mock.calls.find((x) => String(x[0]).includes("UPDATE driver_finance.driver_bills"))!;
    expect(upd[1]).toEqual([BILL, OPCO, 94027, 48]);
    const sqls = c.query.mock.calls.map((x) => String(x[0]));
    expect(sqls.some((s) => /UPDATE driver_finance\.settlement_lines|UPDATE mdata\.drivers|driver_pay_rate/.test(s))).toBe(false);
    expect(mockRelease).not.toHaveBeenCalled(); // not accrued to A/P — nothing to reverse
    expect(mockAudit.mock.calls[0]![2]).toBe("driver_finance.driver_bill.repriced_to_settlement_line");
  });
  it("a bill already accrued to A/P is reversed and re-accrued through THE restate engine", async () => {
    mockRelease.mockResolvedValue({ driver_bill_id: BILL, released: [{ accounting_bill_id: "ap-1", amount_cents: 97945, reversal_journal_entry_id: "je-r" }] });
    mockReaccrue.mockResolvedValue({ accrued: [{ driver_bill_id: BILL }] });
    const r = await repriceDriverBillToSettlementLineInClientTx(client({ accrued: "ap-1" }) as never, input);
    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(mockReaccrue).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ accrual_released: 1, reaccrued: 1 });
  });
  it("refuses: a rate that does not reproduce the line, a posted settlement, a foreign line, a voided bill, deadhead pay", async () => {
    await expect(repriceDriverBillToSettlementLineInClientTx(client() as never, { ...input, ratePerMileCents: 50 })).rejects.toMatchObject({ code: "rate_does_not_reproduce_settlement" });
    await expect(repriceDriverBillToSettlementLineInClientTx(client({ posted: true }) as never, input)).rejects.toMatchObject({ code: "settlement_posted" });
    await expect(repriceDriverBillToSettlementLineInClientTx(client({ line: false }) as never, input)).rejects.toMatchObject({ code: "settlement_line_not_this_bill" });
    await expect(repriceDriverBillToSettlementLineInClientTx(client({ status: "void" }) as never, input)).rejects.toMatchObject({ code: "driver_bill_not_editable" });
    await expect(repriceDriverBillToSettlementLineInClientTx(client({ deadhead: "1000" }) as never, input)).rejects.toMatchObject({ code: "deadhead_pay_present" });
  });
  it("idempotent: already at the settlement amount → unchanged, no write", async () => {
    const c = client({ gross: "94027" });
    c.query.mockImplementationOnce(async () => ({ rows: [{ id: BILL, load_id: "l", load_number: "13693", status: "open", voided_at: null, team_driver_id: null, miles: "1958.9", rate: 48, gross: "94027", deadhead: "0", settlement_id: SETTLEMENT, accrued: null, accrued_team: null }] }));
    const r = await repriceDriverBillToSettlementLineInClientTx(c as never, input);
    expect(r.unchanged).toBe(true);
    expect(c.query.mock.calls.some((x) => String(x[0]).includes("UPDATE driver_finance.driver_bills"))).toBe(false);
  });
});
