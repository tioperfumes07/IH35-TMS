import { describe, expect, it, vi } from "vitest";
import { chooseLegMiles } from "../load-lane-learning.service.js";

describe("chooseLegMiles same point (13628)", () => {
  it("two stops at one real point are 0.0 miles, exact, with no lookup and no straight line", async () => {
    const client = { query: vi.fn(async () => { throw new Error("no query expected"); }) };
    const route = vi.fn(async () => null);
    const p = { lat: 40.788512, lng: -74.0670297 };
    const r = await chooseLegMiles(client as never, { operatingCompanyId: "co", from: p, to: { ...p } }, undefined, route as never);
    expect(r).toEqual({ miles: 0, method: "same_point" });
    expect(client.query).not.toHaveBeenCalled();
    expect(route).not.toHaveBeenCalled();
  });
});
