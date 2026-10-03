import { describe, expect, it } from "vitest";
import { FeedGateError } from "../../driver-finance/feed-gate/feed-gate.service.js";
import { SettlementLinesNotApprovedError, settlementApprovalRefusal } from "../approval.service.js";

// SETL-DUAL-APPROVAL-STATE-CONTRADICTION — the routes that move driver_settlements.status to 'approved'
// turn approveSettlement()'s two refusals into a 409; anything else must still surface as a failure.
describe("settlementApprovalRefusal", () => {
  it("maps unapproved lines to settlement_lines_not_approved with the counts", () => {
    const r = settlementApprovalRefusal(new SettlementLinesNotApprovedError(2, 1));
    expect(r).toEqual({
      error: "settlement_lines_not_approved",
      message: "Cannot approve: 2 lines pending, 1 lines rejected",
      details: { pending_count: 2, rejected_count: 1 },
    });
  });

  it("maps a red feed gate to its own code and rows", () => {
    const rows = [{ check_key: "gross_equals_bills", status: "fail" }];
    const r = settlementApprovalRefusal(new FeedGateError("feed_gate_blocked", "1 red check", rows));
    expect(r).toEqual({ error: "feed_gate_blocked", message: "1 red check", details: rows });
  });

  it("returns null for any other error so it is not swallowed as a refusal", () => {
    expect(settlementApprovalRefusal(new Error("connection reset"))).toBeNull();
    expect(settlementApprovalRefusal("x")).toBeNull();
  });
});
