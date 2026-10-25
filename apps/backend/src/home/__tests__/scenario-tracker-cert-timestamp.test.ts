import { describe, expect, it } from "vitest";
import { formatCertVerifiedAt } from "../scenario-tracker.service.js";

describe("formatCertVerifiedAt (D059)", () => {
  it("formats a UTC timestamptz as MM/DD/YYYY h:mm AM/PM CT", () => {
    // 2026-08-04 20:42:11.123456+00 → 3:42 PM CT (CDT, UTC-5)
    expect(formatCertVerifiedAt("2026-08-04 20:42:11.123456+00")).toBe("08/04/2026 3:42 PM CT");
  });

  it("formats an ISO instant the same way", () => {
    expect(formatCertVerifiedAt("2026-08-04T20:42:11.123Z")).toBe("08/04/2026 3:42 PM CT");
  });

  it("returns empty for nullish and passes through unparseable raw", () => {
    expect(formatCertVerifiedAt(null)).toBe("");
    expect(formatCertVerifiedAt(undefined)).toBe("");
    expect(formatCertVerifiedAt("not-a-date")).toBe("not-a-date");
  });
});
