import { describe, expect, it } from "vitest";
import { amountToCents, resolveRmPseLane } from "../wo-ap.shared.js";

describe("maint wo-ap shared", () => {
  it("maps maintenance buckets to R&M PSE lanes", () => {
    expect(resolveRmPseLane("in_house")).toBe("R&M-INT");
    expect(resolveRmPseLane("external")).toBe("R&M-EXT");
    expect(resolveRmPseLane("roadside")).toBe("R&M-RS");
    expect(resolveRmPseLane("otr_shop")).toBe("R&M-OTR");
  });

  it("converts currency amounts to cents", () => {
    expect(amountToCents("12.34")).toBe(1234);
    expect(amountToCents(0)).toBe(0);
    expect(amountToCents(null)).toBe(0);
  });
});
