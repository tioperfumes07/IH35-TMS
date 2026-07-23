import { describe, expect, it } from "vitest";
import { dueDateFromBillTerms, netDaysFromTerms } from "./vendorBillDueDate";

describe("vendorBillDueDate", () => {
  it("maps Net terms to day counts", () => {
    expect(netDaysFromTerms("net_30")).toBe(30);
    expect(netDaysFromTerms("net_15")).toBe(15);
    expect(netDaysFromTerms("net_7")).toBe(7);
    expect(netDaysFromTerms("due_on_receipt")).toBe(0);
  });

  it("computes due date from bill date + Net 30 (QBO parity)", () => {
    expect(dueDateFromBillTerms("2026-07-01", "net_30")).toBe("2026-07-31");
    expect(dueDateFromBillTerms("2026-01-31", "net_7")).toBe("2026-02-07");
    expect(dueDateFromBillTerms("2026-07-21", "net_15")).toBe("2026-08-05");
  });

  it("returns empty for invalid bill date", () => {
    expect(dueDateFromBillTerms("", "net_30")).toBe("");
    expect(dueDateFromBillTerms("07/01/2026", "net_30")).toBe("");
  });
});
