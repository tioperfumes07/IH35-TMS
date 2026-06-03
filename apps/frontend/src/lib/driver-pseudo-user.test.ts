import { describe, expect, it } from "vitest";
import { filterHumanDrivers, isPseudoDriver } from "./driver-pseudo-user";

describe("driver pseudo-user helpers", () => {
  it("detects Safety Safety placeholder rows", () => {
    expect(
      isPseudoDriver({
        first_name: "Safety",
        last_name: "Safety",
        cdl_number: "safety",
      })
    ).toBe(true);
  });

  it("filterHumanDrivers removes pseudo-users from human-facing driver dropdown lists", () => {
    const filtered = filterHumanDrivers([
      { first_name: "Alex", last_name: "Rivera", cdl_number: "TX123" },
      { first_name: "Safety", last_name: "Safety", cdl_number: "safety" },
      { first_name: "System", last_name: "System", cdl_number: "system" },
    ]);

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.first_name).toBe("Alex");
  });
});
