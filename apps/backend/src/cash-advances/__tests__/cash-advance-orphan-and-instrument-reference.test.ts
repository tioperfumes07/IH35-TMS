import { describe, expect, it, vi } from "vitest";

// B8 (GO-23 wave 2) — two checks the FE wizard's zod schema already enforces but this CORE
// function did not, so callers that bypass the route (cash-advance-owner-approval.service.ts,
// driver-hub-requests.service.ts, bank-driver-advance.service.ts) could still create an orphan:
//   1. an electronic disbursement (direct_bank_transfer/wire) with no from_bank_account_id and no
//      vendor recipient to stand in for one — nothing downstream can resolve which real account
//      the money left from.
//   2. any disbursement other than in_person_check with no instrument/reference number — nothing
//      lets the owner match the advance to what actually cleared the bank.

vi.mock("../display-id.js", () => ({ nextCashAdvanceDisplayId: vi.fn(async () => "CA-1") }));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn() }));

const { createDriverCashAdvanceCore } = await import("../cash-advance-create.js");

const ACTOR = "22222222-2222-4222-8222-222222222222";
const OPCO = "11111111-1111-4111-8111-111111111111";
const DRIVER = "33333333-3333-4333-8333-333333333333";
const BANK = "66666666-6666-4666-8666-666666666666";

function makeClient() {
  const client = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("information_schema.columns")) return { rows: [{ ok: false }] };
      if (sql.includes("FROM mdata.drivers")) return { rows: [{ id: params[0], status: "active" }] };
      if (sql.includes("FROM banking.bank_accounts")) return { rows: [{ id: params[0] }] };
      if (sql.includes("INSERT INTO driver_finance.driver_liabilities")) return { rows: [{ id: "liab-1" }] };
      if (sql.includes("INSERT INTO driver_finance.deduction_schedule")) return { rows: [] };
      if (sql.includes("INSERT INTO driver_finance.driver_advances")) return { rows: [{ id: "adv-1" }] };
      if (sql.includes("views.cash_advances_with_context")) return { rows: [{ id: "adv-1" }] };
      return { rows: [] };
    }),
  };
  return client;
}

const baseBody = {
  driver_id: DRIVER,
  amount: 200,
  purpose: "other" as const,
  recipient_info: { recipient_type: "driver" as const },
  recovery_mode: "full" as const,
};

describe("createDriverCashAdvanceCore — orphan refusal (no payment account, no vendor)", () => {
  it("refuses direct_bank_transfer with no from_bank_account_id and no vendor recipient", async () => {
    const res = await createDriverCashAdvanceCore(makeClient(), ACTOR, OPCO, {
      ...baseBody,
      disbursement_method: "direct_bank_transfer",
      recipient_info: { recipient_type: "driver", bank_reference: "REF-1" },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("cash_advance_orphan_no_payment_account");
  });

  it("refuses wire with no from_bank_account_id and no vendor recipient", async () => {
    const res = await createDriverCashAdvanceCore(makeClient(), ACTOR, OPCO, {
      ...baseBody,
      disbursement_method: "wire",
      recipient_info: { recipient_type: "third_party", bank_reference: "REF-2" },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("cash_advance_orphan_no_payment_account");
  });

  it("allows a vendor recipient to stand in for a bank account", async () => {
    const res = await createDriverCashAdvanceCore(makeClient(), ACTOR, OPCO, {
      ...baseBody,
      disbursement_method: "direct_bank_transfer",
      recipient_info: { recipient_type: "vendor", bank_reference: "REF-3" },
    });
    expect(res.ok).toBe(true);
  });

  it("comdata never requires a bank account (external card network)", async () => {
    const res = await createDriverCashAdvanceCore(makeClient(), ACTOR, OPCO, {
      ...baseBody,
      disbursement_method: "comdata",
      recipient_info: { recipient_type: "driver", bank_reference: "COMDATA-9001" },
    });
    expect(res.ok).toBe(true);
  });
});

describe("createDriverCashAdvanceCore — instrument reference required", () => {
  it("refuses wire with no bank_reference even when a bank account is present", async () => {
    const res = await createDriverCashAdvanceCore(makeClient(), ACTOR, OPCO, {
      ...baseBody,
      disbursement_method: "wire",
      from_bank_account_id: BANK,
      recipient_info: { recipient_type: "driver" },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("cash_advance_instrument_reference_required");
  });

  it("refuses comdata with an empty/whitespace-only bank_reference", async () => {
    const res = await createDriverCashAdvanceCore(makeClient(), ACTOR, OPCO, {
      ...baseBody,
      disbursement_method: "comdata",
      recipient_info: { recipient_type: "driver", bank_reference: "   " },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("cash_advance_instrument_reference_required");
  });

  it("in_person_check is the one exception — no reference required", async () => {
    const res = await createDriverCashAdvanceCore(makeClient(), ACTOR, OPCO, {
      ...baseBody,
      disbursement_method: "in_person_check",
      recipient_info: { recipient_type: "driver" },
    });
    expect(res.ok).toBe(true);
  });

  it("accepts a wire with both a bank account and a real reference", async () => {
    const res = await createDriverCashAdvanceCore(makeClient(), ACTOR, OPCO, {
      ...baseBody,
      disbursement_method: "wire",
      from_bank_account_id: BANK,
      recipient_info: { recipient_type: "driver", bank_reference: "WIRE-CONF-5521" },
    });
    expect(res.ok).toBe(true);
  });
});
