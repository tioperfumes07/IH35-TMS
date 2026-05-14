import { describe, it, expect } from "vitest";
import { getRateLimiterRedis } from "../rate-limit.js";

describe("rate-limit redis wiring", () => {
  it("returns null when REDIS_URL is unset (limits skipped)", () => {
    const prev = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    expect(getRateLimiterRedis()).toBeNull();
    process.env.REDIS_URL = prev;
  });
});
