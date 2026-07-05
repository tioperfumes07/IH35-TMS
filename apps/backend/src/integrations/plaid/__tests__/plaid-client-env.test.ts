import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPlaidEnvForAudit } from "../plaid-client.js";

// H7-2: Plaid retired the `development` environment. Only sandbox/production are valid,
// and any other value (including the dead `development`) must fail loud rather than
// silently resolving to an undefined base path.
describe("resolvePlaidEnv (via getPlaidEnvForAudit)", () => {
  const original = process.env.PLAID_ENV;

  beforeEach(() => {
    delete process.env.PLAID_ENV;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.PLAID_ENV;
    else process.env.PLAID_ENV = original;
  });

  it("accepts sandbox", () => {
    process.env.PLAID_ENV = "sandbox";
    expect(getPlaidEnvForAudit()).toBe("sandbox");
  });

  it("accepts production", () => {
    process.env.PLAID_ENV = "production";
    expect(getPlaidEnvForAudit()).toBe("production");
  });

  it("rejects the retired development environment (fail loud)", () => {
    process.env.PLAID_ENV = "development";
    expect(() => getPlaidEnvForAudit()).toThrow(/Unsupported PLAID_ENV/);
  });

  it("rejects an unknown value", () => {
    process.env.PLAID_ENV = "staging";
    expect(() => getPlaidEnvForAudit()).toThrow(/Unsupported PLAID_ENV/);
  });

  it("requires PLAID_ENV to be set", () => {
    expect(() => getPlaidEnvForAudit()).toThrow(/PLAID_ENV is required/);
  });
});
