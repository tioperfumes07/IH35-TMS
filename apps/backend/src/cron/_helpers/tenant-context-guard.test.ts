import { describe, expect, it } from "vitest";
import { assertTenantContext } from "./tenant-context-guard.js";

describe("assertTenantContext", () => {
  it("rejects empty tenant context", () => {
    expect(() => assertTenantContext("", "demo.cron")).toThrow(/empty operating_company_id/i);
    expect(() => assertTenantContext(null, "demo.cron")).toThrow(/empty operating_company_id/i);
    expect(() => assertTenantContext(undefined, "demo.cron")).toThrow(/empty operating_company_id/i);
  });

  it("rejects malformed UUID values", () => {
    expect(() => assertTenantContext("abc", "demo.cron")).toThrow(/malformed operating_company_id/i);
    expect(() => assertTenantContext("1234", "demo.cron")).toThrow(/malformed operating_company_id/i);
  });

  it("accepts a valid UUID", () => {
    expect(() =>
      assertTenantContext("11111111-1111-1111-1111-111111111111", "demo.cron")
    ).not.toThrow();
  });
});
