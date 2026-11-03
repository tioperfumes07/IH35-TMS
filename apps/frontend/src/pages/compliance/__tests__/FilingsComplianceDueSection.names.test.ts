import { describe, expect, it } from "vitest";
import { filingDetailLabel } from "../FilingsComplianceDueSection";

describe("filingDetailLabel (row 214 — driver labels on Compliance › Filings)", () => {
  it("HUGO GAYTAN — CDL → Hugo Gaytan — CDL", () => {
    expect(filingDetailLabel({ category: "cdl", detail: "HUGO GAYTAN — Commercial Driver License", drill_through: null })).toBe(
      "Hugo Gaytan — Commercial Driver License",
    );
  });
  it("clearinghouse / MVR rows proper-case the leading driver name only", () => {
    expect(
      filingDetailLabel({ category: "driver_mvr", detail: "EDUARDO FLORES — annual motor vehicle record review (49 CFR §391.25)", drill_through: "/drivers/x" }),
    ).toBe("Eduardo Flores — annual motor vehicle record review (49 CFR §391.25)");
  });
  it("non-driver filings stay exactly as sent", () => {
    expect(filingDetailLabel({ category: "permit", detail: "OS/OW #123 (TX)", drill_through: "/compliance" })).toBe("OS/OW #123 (TX)");
    expect(filingDetailLabel({ category: "irp", detail: "UNIT 101 — IRP CAB CARD", drill_through: "/units/1" })).toBe("UNIT 101 — IRP CAB CARD");
  });
});
