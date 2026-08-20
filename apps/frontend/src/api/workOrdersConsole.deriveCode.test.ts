import { describe, expect, it } from "vitest";
import { deriveWoCancellationReasonCode } from "./workOrdersConsole";

// WO-CANCEL-REASON-NO-CREATE-ROUTE — the inline "+ Add new" only captures a free-typed label
// (the catalog's PK is reason_code, uppercase snake_case), so the derivation must always produce
// a code matching the backend's REASON_CODE_REGEX (^[A-Z][A-Z0-9_]*$) no matter what the operator
// types, or the create POST 400s right after the operator already saw "Add new" succeed visually.
describe("deriveWoCancellationReasonCode", () => {
  it("uppercases and underscores a normal label", () => {
    expect(deriveWoCancellationReasonCode("Customer requested delay")).toBe("CUSTOMER_REQUESTED_DELAY");
  });

  it("collapses punctuation and repeated separators", () => {
    expect(deriveWoCancellationReasonCode("  parts -- not available!! ")).toBe("PARTS_NOT_AVAILABLE");
  });

  it("prefixes when the derived code would not start with a letter", () => {
    expect(deriveWoCancellationReasonCode("3rd party issue")).toBe("REASON_3RD_PARTY_ISSUE");
  });

  it("never produces a leading or trailing underscore", () => {
    const code = deriveWoCancellationReasonCode("!!! wrong vendor !!!");
    expect(code.startsWith("_")).toBe(false);
    expect(code.endsWith("_")).toBe(false);
  });
});
