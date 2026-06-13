import { describe, expect, it, vi } from "vitest";

// B5: approveCashAdvanceRequest cascade routing. Pure unit test — DB + imported services mocked.

const { mockCreateAdvance, mockCreateLoan, mockThreshold, mockDeduction, mockEmit, mockCrudAudit } = vi.hoisted(
  () => ({
    mockCreateAdvance: vi.fn(),
    mockCreateLoan: vi.fn(),
    mockThreshold: vi.fn(async () => 500),
    mockDeduction: vi.fn(),
    mockEmit: vi.fn(),
    mockCrudAudit: vi.fn(),
  })
);

vi.mock("../../cash-advances/cash-advance-create.js", () => ({
  createDriverCashAdvanceCore: mockCreateAdvance,
  createEmployeeLoanCore: mockCreateLoan,
  resolveCompanyCashAdvanceThresholdDollars: mockThreshold,
}));
vi.mock("../deductions.service.js", () => ({ createSettlementDeduction: mockDeduction }));
vi.mock("../driver-request-spine-emit.js", () => ({ emitDriverRequestSpineEvent: mockEmit }));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: mockCrudAudit }));

const { approveCashAdvanceRequest } = await import("../cash-advance-requests.service.js");

const OC = "11111111-1111-4111-8111-111111111111";
const REQ = "33333333-3333-4333-8333-333333333333";
const DRIVER = "44444444-4444-4444-8444-444444444444";
const ACTOR = "22222222-2222-4222-8222-222222222222";
const LOAD = "55555555-5555-4555-8555-555555555555";
const LOAD_BILL = "66666666-6666-4666-8666-666666666666";
const OPEN_BILL = "77777777-7777-4777-8777-777777777777";

function makeClient(scn: { activeLoad?: boolean; loadBill?: boolean; openBill?: boolean }) {
  const client = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("FROM driver_finance.cash_advance_requests") && sql.includes("FOR UPDATE")) {
        return {
          rows: [
            {
              id: REQ,
              driver_id: DRIVER,
              status: "pending",
              requested_amount_cents: 50000,
              expires_at: "2099-01-01T00:00:00Z",
              is_above_policy: false,
              display_id: "CAR-1",
            },
          ],
        };
      }
      if (sql.includes("FROM mdata.loads")) {
        return { rows: scn.activeLoad ? [{ id: LOAD }] : [] };
      }
      if (sql.includes("FROM driver_finance.driver_bills") && sql.includes("load_id = $3")) {
        return { rows: scn.loadBill ? [{ id: LOAD_BILL }] : [] };
      }
      if (sql.includes("FROM driver_finance.driver_bills")) {
        return { rows: scn.openBill ? [{ id: OPEN_BILL }] : [] };
      }
      if (sql.includes("UPDATE driver_finance.cash_advance_requests")) {
        return { rows: [{ id: REQ, display_id: "CAR-1", status: "approved" }] };
      }
      return { rows: [] };
    }),
  };
  return client;
}

function resetCoreMocks() {
  mockCreateAdvance.mockReset();
  mockCreateAdvance.mockResolvedValue({ ok: true, advanceId: "adv-1", displayId: "CA-1", liabilityId: "liab-1", data: {} });
  mockCreateLoan.mockReset();
  mockCreateLoan.mockResolvedValue({ ok: true, advanceId: "adv-1", displayId: "CA-1", liabilityId: "liab-1", data: {} });
  mockDeduction.mockReset();
  mockEmit.mockReset();
  mockCrudAudit.mockReset();
}

const baseArgs = { operatingCompanyId: OC, requestId: REQ, actorUserId: ACTOR, actorRole: "Administrator", body: {} };

describe("approveCashAdvanceRequest cascade (B5)", () => {
  it("branch 1: active load WITH an open driver_bill -> advance linked to that bill", async () => {
    resetCoreMocks();
    const client = makeClient({ activeLoad: true, loadBill: true, openBill: true });
    const res = await approveCashAdvanceRequest(client, baseArgs);
    expect("error" in res).toBe(false);
    expect(mockCreateLoan).not.toHaveBeenCalled();
    expect(mockCreateAdvance).toHaveBeenCalledWith(
      client,
      ACTOR,
      OC,
      expect.objectContaining({ liability_type: "advance", linked_driver_bill_id: LOAD_BILL })
    );
    if (!("error" in res)) expect(res.cascadeBranch).toBe("load_bill");
  });

  it("branch 2: no active load but an open driver_bill -> advance linked to the open bill", async () => {
    resetCoreMocks();
    const client = makeClient({ activeLoad: false, openBill: true });
    const res = await approveCashAdvanceRequest(client, baseArgs);
    expect(mockCreateAdvance).toHaveBeenCalledWith(
      client,
      ACTOR,
      OC,
      expect.objectContaining({ linked_driver_bill_id: OPEN_BILL })
    );
    if (!("error" in res)) expect(res.cascadeBranch).toBe("open_bill");
  });

  it("Fork 3: active load but NO open bill for it -> falls through to the open-bill branch", async () => {
    resetCoreMocks();
    const client = makeClient({ activeLoad: true, loadBill: false, openBill: true });
    const res = await approveCashAdvanceRequest(client, baseArgs);
    expect(mockCreateAdvance).toHaveBeenCalledWith(
      client,
      ACTOR,
      OC,
      expect.objectContaining({ linked_driver_bill_id: OPEN_BILL })
    );
    if (!("error" in res)) expect(res.cascadeBranch).toBe("open_bill");
  });

  it("branch 3: no load and no open bills -> EMPLOYEE LOAN (no bill link)", async () => {
    resetCoreMocks();
    const client = makeClient({ activeLoad: false, openBill: false });
    const res = await approveCashAdvanceRequest(client, baseArgs);
    expect(mockCreateAdvance).not.toHaveBeenCalled();
    expect(mockCreateLoan).toHaveBeenCalled();
    if (!("error" in res)) {
      expect(res.cascadeBranch).toBe("loan");
      expect(res.linkedDriverBillId).toBe(null);
    }
  });

  it("ALL branches: keep the settlement-deduction recovery + fire the B4 'approved' emit", async () => {
    resetCoreMocks();
    const client = makeClient({ activeLoad: false, openBill: false }); // loan branch
    await approveCashAdvanceRequest(client, baseArgs);
    expect(mockDeduction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ driverId: DRIVER, amountCents: 50000, sourceType: "cash_advance_repayment" })
    );
    expect(mockEmit).toHaveBeenCalledWith(client, "approved", expect.objectContaining({ actor_role: "Administrator" }));
  });
});
