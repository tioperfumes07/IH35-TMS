import { describe, expect, it } from "vitest";
import { mileageSourceFor } from "../../book-load.service.js";

describe("mileageSourceFor (443.60 #2)", () => {
  it("keeps a named source, names typed miles 'Operator entered', and gives no source without miles", () => {
    expect(mileageSourceFor("History", 100)).toBe("History");
    expect(mileageSourceFor(undefined, 1315, null)).toBe("Operator entered");
    expect(mileageSourceFor(null, "1263.9")).toBe("Operator entered");
    expect(mileageSourceFor(null, null, undefined, "")).toBeNull();
  });
});
