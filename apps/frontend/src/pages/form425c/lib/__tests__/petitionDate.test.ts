import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  casePetitionDateFromReports,
  isIsoDate,
  resolveCreatePetitionDate,
} from "../petitionDate";

const FORBIDDEN_HARDCODE = "2025-02-03";

describe("resolveCreatePetitionDate", () => {
  it("returns trimmed profile / UI date", () => {
    expect(resolveCreatePetitionDate(" 2024-11-15 ")).toBe("2024-11-15");
  });

  it("rejects empty / invalid — never invents a default year or literal", () => {
    expect(() => resolveCreatePetitionDate("")).toThrow(/never hardcode/i);
    expect(() => resolveCreatePetitionDate(undefined)).toThrow(/never hardcode/i);
    expect(() => resolveCreatePetitionDate("02/03/2025")).toThrow(/never hardcode/i);
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

describe("Form425CHome — no hardcoded petition_date (static guard)", () => {
  const homeSrc = readFileSync(
    resolve(__dirname, "../../Form425CHome.tsx"),
    "utf8"
  );
  const profilesSrc = readFileSync(
    resolve(__dirname, "../../tabs/ProfilesTab.tsx"),
    "utf8"
  );

  it("must not hardcode the audit-known bad petition date 2025-02-03", () => {
    expect(homeSrc).not.toContain(FORBIDDEN_HARDCODE);
    expect(homeSrc).not.toMatch(/petition_date\s*:\s*["']\d{4}-\d{2}-\d{2}["']/);
  });

  it("wires create payload from profile petitionDate via resolveCreatePetitionDate", () => {
    expect(homeSrc).toContain("resolveCreatePetitionDate");
    expect(homeSrc).toContain("profiles[activeCompany].petitionDate");
    expect(homeSrc).toContain("petition_date: petitionDate");
  });

  it("exposes a required Profiles DatePicker for petition date", () => {
    expect(profilesSrc).toContain("Petition Date");
    expect(profilesSrc).toContain("form425c-petition-date");
    expect(profilesSrc).toContain("petitionDate");
  });
});
