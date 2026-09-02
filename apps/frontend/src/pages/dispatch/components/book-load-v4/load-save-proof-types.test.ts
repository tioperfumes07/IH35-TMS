import { describe, expect, it } from "vitest";
import { driverLinkFromIds } from "./load-save-proof-types";

describe("GO-17 driver link honesty", () => {
  it("null driver is Not set, never Linked", () => {
    const slot = driverLinkFromIds(null);
    expect(slot.state).toBe("not_set");
    expect(slot.state === "not_set" ? slot.reason : "").toMatch(/not set/i);
  });

  it("empty driver is Not set", () => {
    expect(driverLinkFromIds("").state).toBe("not_set");
    expect(driverLinkFromIds("   ").state).toBe("not_set");
  });

  it("real driver id is Linked", () => {
    const slot = driverLinkFromIds("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(slot.state).toBe("linked");
  });
});
