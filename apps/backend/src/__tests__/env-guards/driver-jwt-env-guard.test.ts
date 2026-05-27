import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

describe("driver jwt env guard", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, NODE_ENV: "production" };
    delete process.env.DRIVER_JWT_SECRET;
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("does not crash import when DRIVER_JWT_SECRET is missing", async () => {
    await expect(import("../../driver/driver-jwt.js")).resolves.toBeDefined();
  });

  it("fails closed for verify and throws on issue when secret is missing", async () => {
    const mod = await import("../../driver/driver-jwt.js");
    expect(mod.verifyDriverAccessToken("bad-token")).toBeNull();
    expect(mod.verifyDriverRefreshToken("bad-token")).toBeNull();
    expect(() => mod.issueDriverTokenPair("00000000-0000-0000-0000-000000000000", "Driver")).toThrow(
      "DRIVER_JWT_SECRET is required for driver PWA JWTs"
    );
  });
});
