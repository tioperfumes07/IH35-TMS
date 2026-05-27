import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

describe("auth db lazy env guard", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_DIRECT_URL;
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("does not throw during module import when database env is missing", async () => {
    await expect(import("../../auth/db.js")).resolves.toBeDefined();
  });

  it("fails closed when a pool is requested without database env", async () => {
    const mod = await import("../../auth/db.js");
    expect(() => mod.getPool()).toThrow("DATABASE_URL is required");
    expect(() => mod.getLuciaPool()).toThrow("DATABASE_DIRECT_URL is required");
  });
});
