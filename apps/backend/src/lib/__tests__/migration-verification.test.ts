import { describe, it, expect } from "vitest";

describe("migration-verification module", () => {
  it("imports without throwing", async () => {
    const mod = await import("../migration-verification.js");
    expect(typeof mod.verifyMigrationsOnStartup).toBe("function");
  });
});
