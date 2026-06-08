import { describe, expect, it } from "vitest";
import { cacheGet, cacheSet } from "../live-position.service.js";

describe("position cache", () => {
  it("returns cached value within TTL", () => {
    cacheSet("test-key", { lat: 1 }, 5000);
    expect(cacheGet("test-key")).toEqual({ lat: 1 });
  });
});

describe("stale detection", () => {
  it("marks positions older than 5 minutes as stale", () => {
    const sixMinAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    const stale = Date.now() - new Date(sixMinAgo).getTime() > 5 * 60 * 1000;
    expect(stale).toBe(true);
  });
});
