import { describe, expect, it } from "vitest";
import { settlementCloseNetPay } from "../settlementCloseNet";

describe("settlementCloseNetPay", () => {
  it("uses stored net when non-zero", () => {
    expect(
      settlementCloseNetPay({
        storedNet: 1500.5,
        gross: 2000,
        earnings: 0,
        otherDeductionsTotal: 100,
        escrowContribution: 50,
        advanceRecovery: 0,
        reimbursements: 0,
      }),
    ).toBe(1500.5);
  });

  it("computes from components when stored net is 0 with positive gross (board 37 FAIL)", () => {
    expect(
      settlementCloseNetPay({
        storedNet: 0,
        gross: 979.45,
        earnings: 0,
        otherDeductionsTotal: 0,
        escrowContribution: 0,
        advanceRecovery: 0,
        reimbursements: 0,
      }),
    ).toBe(979.45);
  });

  it("computes gross − deductions − escrow − advances + reimbursements", () => {
    expect(
      settlementCloseNetPay({
        storedNet: 0,
        gross: 1000,
        earnings: 0,
        otherDeductionsTotal: 60,
        escrowContribution: 25,
        advanceRecovery: 40,
        reimbursements: 15,
      }),
    ).toBe(890);
  });

  it("falls back to earnings when gross is 0", () => {
    expect(
      settlementCloseNetPay({
        storedNet: 0,
        gross: 0,
        earnings: 500,
        otherDeductionsTotal: 50,
        escrowContribution: 0,
        advanceRecovery: 0,
        reimbursements: 0,
      }),
    ).toBe(450);
  });
});
