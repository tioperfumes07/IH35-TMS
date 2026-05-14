import { describe, expect, it, beforeEach } from "vitest";
import { hasDriverAccessToken } from "./auth-token";

describe("auth-token", () => {
  beforeEach(() => {
    localStorage.removeItem("ih35_driver_access_token");
    localStorage.removeItem("ih35_driver_access_exp");
  });

  it("detects access token in localStorage", () => {
    expect(hasDriverAccessToken()).toBe(false);
    localStorage.setItem("ih35_driver_access_token", "test.jwt.sig");
    expect(hasDriverAccessToken()).toBe(true);
  });
});
