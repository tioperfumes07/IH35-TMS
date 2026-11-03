import { describe, expect, it } from "vitest";
import { docsEntityLabel } from "./DocsHomePage";

const id = "33333333-3333-4333-8333-333333333333";

describe("docsEntityLabel (row 231 — Docs › All Entities names)", () => {
  it("driver HUGO GAYTAN → Hugo Gaytan", () => {
    expect(docsEntityLabel("driver", "HUGO GAYTAN", id, "Driver")).toBe("Hugo Gaytan");
  });
  it("customer / vendor ALL CAPS → proper case with suffix upper", () => {
    expect(docsEntityLabel("customer", "ACME FREIGHT LLC", id, "Customer")).toBe("Acme Freight LLC");
    expect(docsEntityLabel("vendor", "LOVES TRAVEL STOPS INC", id, "Vendor")).toBe("Loves Travel Stops INC");
  });
  it("unit numbers stay as stored", () => {
    expect(docsEntityLabel("unit", "TRK-101A", id, "Unit")).toBe("TRK-101A");
  });
});
