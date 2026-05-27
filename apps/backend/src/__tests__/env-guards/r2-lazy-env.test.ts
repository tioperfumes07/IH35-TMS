import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

describe("r2 lazy env guard", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    delete process.env.R2_BUCKET;
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("does not boot-crash modules that depend on R2 env", async () => {
    await expect(import("../../storage/r2-client.js")).resolves.toBeDefined();
    await expect(import("../../legal/contracts.service.js")).resolves.toBeDefined();
    await expect(import("../../legal/matters.service.js")).resolves.toBeDefined();
  });

  it("returns explicit runtime failure when presigning without R2 env", async () => {
    const r2 = await import("../../storage/r2-client.js");
    expect(r2.isR2Configured()).toBe(false);
    await expect(r2.generatePresignedUploadUrl("x/test.txt", "text/plain")).rejects.toThrow("r2_not_configured");
  });
});
