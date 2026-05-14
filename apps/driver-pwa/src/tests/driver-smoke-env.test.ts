import { describe, expect, it } from "vitest";

describe("DRIVER_SMOKE_EMAIL (P7-FIX-DRIVER-SMOKE-ENV)", () => {
  it("documents Playwright expectations without failing CI when unset", () => {
    const email = process.env.DRIVER_SMOKE_EMAIL?.trim() ?? "";
    if (!email) {
      expect(true).toBe(true);
      return;
    }
    expect(email).toContain("@");
  });
});
