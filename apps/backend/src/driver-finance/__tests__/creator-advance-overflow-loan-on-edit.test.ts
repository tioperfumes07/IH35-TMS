// LEAD 443.183 G9 — an advance larger than its bill's open balance is split by the cash-advance engine: the bill payment
// plus a separate LOAN for the overflow. The Creator kept only the bill-payment id, so an Edit reversed the payment and left
// the loan live (driver owed twice). The overflow loan id is kept with the post and reversed on Edit.
import { describe, expect, it } from "vitest";
import { advanceIdsUndoneOnEdit, overflowLoanAdvanceId } from "../settlement-creator.service.js";

describe("443.183 G9 — overflow loan id kept and voided on Edit", () => {
  it("reads the overflow loan the engine booked above the bill's balance", () => {
    expect(overflowLoanAdvanceId({ overflow_loan: { advance_id: "adv-loan", amount_cents: 5000 } })).toBe("adv-loan");
  });
  it("no overflow -> nothing to keep", () => {
    expect(overflowLoanAdvanceId({ overflow_loan: null })).toBeNull();
    expect(overflowLoanAdvanceId({})).toBeNull();
    expect(overflowLoanAdvanceId(undefined)).toBeNull();
  });
  it("Edit reverses the post's advances AND their overflow loans (once each)", () => {
    expect(advanceIdsUndoneOnEdit({ advance_ids: ["adv-1", "adv-2"], overflow_loan_ids: ["adv-loan"] })).toEqual(["adv-1", "adv-2", "adv-loan"]);
    expect(advanceIdsUndoneOnEdit({ advance_ids: ["adv-1"], overflow_loan_ids: ["adv-1"] })).toEqual(["adv-1"]);
    expect(advanceIdsUndoneOnEdit({ advance_ids: ["adv-1"] })).toEqual(["adv-1"]);
  });
});
