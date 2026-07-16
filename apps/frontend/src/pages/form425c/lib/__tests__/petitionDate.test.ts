import { describe, expect, it } from "vitest";
import {
  casePetitionDateFromReports,
  isIsoDate,
  resolveCreatePetitionDate,
} from "../petitionDate";

/** Audit-known bad hardcoded date — helper must never invent this as a default. */
const FORBIDDEN_HARDCODE = "2025-02-03";

describe("resolveCreatePetitionDate", () => {
  it("returns trimmed profile / UI date", () => {
    expect(resolveCreatePetitionDate(" 2024-11-15 ")).toBe("2024-11-15");
  });

  it("rejects empty / invalid — never invents a default year or literal", () => {
    expect(() => resolveCreatePetitionDate("")).toThrow(/never hardcode/i);
    expect(() => resolveCreatePetitionDate(undefined)).toThrow(/never hardcode/i);
    expect(() => resolveCreatePetitionDate(null)).toThrow(/never hardcode/i);
    expect(() => resolveCreatePetitionDate("02/03/2025")).toThrow(/never hardcode/i);
    expect(() => resolveCreatePetitionDate("   ")).toThrow(/never hardcode/i);
  });

  it("never invents the audit-known hardcoded petition date 2025-02-03", () => {
    for (const input of ["", undefined, null, "02/03/2025", "not-a-date"] as const) {
      try {
        const out = resolveCreatePetitionDate(input);
        expect(out).not.toBe(FORBIDDEN_HARDCODE);
      } catch (err) {
        expect(String(err)).toMatch(/never hardcode/i);
      }
    }
    // Valid profile dates pass through unchanged — still not invented by the helper.
    expect(resolveCreatePetitionDate(FORBIDDEN_HARDCODE)).toBe(FORBIDDEN_HARDCODE);
    expect(resolveCreatePetitionDate("2024-11-15")).not.toBe(FORBIDDEN_HARDCODE);
  });
});

describe("casePetitionDateFromReports", () => {
  it("picks earliest created case petition_date", () => {
    expect(
      casePetitionDateFromReports([
        { petition_date: "2024-11-15", created_at: "2025-03-01", reporting_month: "2025-02-01" },
        { petition_date: "2024-11-15", created_at: "2025-01-01", reporting_month: "2024-12-01" },
      ])
    ).toBe("2024-11-15");
  });

  it("returns null when no report has a petition date", () => {
    expect(casePetitionDateFromReports([{ reporting_month: "2025-01-01" }])).toBeNull();
  });
});

describe("isIsoDate", () => {
  it("accepts YYYY-MM-DD only", () => {
    expect(isIsoDate("2024-11-15")).toBe(true);
    expect(isIsoDate("2024-11-15T00:00:00Z")).toBe(false);
  });
});
