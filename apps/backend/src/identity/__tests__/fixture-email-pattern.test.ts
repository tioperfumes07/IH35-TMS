import { describe, expect, it } from "vitest";
import { FIXTURE_USER_EMAIL_RE, isFixtureUserEmail } from "../fixture-email-pattern.js";

// Locks the byte-exact behavior of the shared fixture/probe-email pattern. This regex drives a
// PROD account guard (blocks creating fixture users) AND the admin deactivate-probe-accounts job.
// It was previously duplicated in users.routes.ts and admin-jobs.service.ts and "kept in sync
// manually" — this test fails CI if the shared pattern ever changes matching behavior.
describe("FIXTURE_USER_EMAIL_RE / isFixtureUserEmail", () => {
  const KNOWN_PROBE_EMAILS = [
    "m2-probe-transp-owner@example.com",
    "m2-stop-1234@example.com",
    "tioperfumes07+verifyfix@gmail.com",
  ];

  it.each(KNOWN_PROBE_EMAILS)("matches known probe/fixture email: %s", (email) => {
    expect(FIXTURE_USER_EMAIL_RE.test(email)).toBe(true);
    expect(isFixtureUserEmail(email)).toBe(true);
  });

  it("matches any RFC-2606 reserved test domain (.com/.org/.net)", () => {
    expect(isFixtureUserEmail("anyone@example.com")).toBe(true);
    expect(isFixtureUserEmail("anyone@example.org")).toBe(true);
    expect(isFixtureUserEmail("anyone@example.net")).toBe(true);
  });

  const NORMAL_EMAILS = [
    "jorge@ih35dispatch.com",
    "dispatcher@gmail.com",
    "driver.smith@company.co",
    "m2probe@gmail.com", // no separator before the probe token -> must NOT match
  ];

  it.each(NORMAL_EMAILS)("does NOT match a normal email: %s", (email) => {
    expect(FIXTURE_USER_EMAIL_RE.test(email)).toBe(false);
    expect(isFixtureUserEmail(email)).toBe(false);
  });

  it("is the exact expected source pattern (guards against silent drift)", () => {
    expect(FIXTURE_USER_EMAIL_RE.source).toBe(
      "@example\\.(com|org|net)$|(^|[.+_-])(m2-probe|m2-stop|verifyfix)\\b",
    );
    expect(FIXTURE_USER_EMAIL_RE.flags).toBe("i");
  });
});
