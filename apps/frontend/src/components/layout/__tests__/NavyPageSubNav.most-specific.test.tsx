import { describe, expect, it } from "vitest";
import { mostSpecificActiveTo } from "../NavyPageSubNav";

// ROUND 441.6: an index tab (/finance) prefix-matches every sibling (/finance/overview), so two tabs were current at once.
describe("mostSpecificActiveTo", () => {
  const tabs = ["/finance/overview", "/finance/projections", "/finance", "/finance/statements"];
  it("the deeper tab wins over the module index", () => {
    expect(mostSpecificActiveTo("/finance/overview", tabs)).toBe("/finance/overview");
    expect(mostSpecificActiveTo("/finance/statements/2026", tabs)).toBe("/finance/statements");
  });
  it("the index tab is current on itself and on a child that has no tab of its own", () => {
    expect(mostSpecificActiveTo("/finance", tabs)).toBe("/finance");
    expect(mostSpecificActiveTo("/finance/hub", tabs)).toBe("/finance");
  });
  it("a sibling that only shares a string prefix is not a match", () => {
    expect(mostSpecificActiveTo("/finance-old", tabs)).toBeNull();
  });
});
