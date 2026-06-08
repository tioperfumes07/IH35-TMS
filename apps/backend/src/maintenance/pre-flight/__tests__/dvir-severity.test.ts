import { describe, expect, it, vi } from "vitest";

vi.mock("../../../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn(async () => undefined),
}));

import { MAJOR_DEFECT_CODES, classifyMajorDefect } from "../major-defect-catalog.js";
import { canOverrideMajor, classifyDefect, isValidSeverity, setSeverity, type DbClient } from "../dvir-severity.service.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const DEFECT = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";

/** Known-major defects that MUST classify as major (49 CFR §396.11). */
const KNOWN_MAJOR_CASES: Array<{ desc: string; category?: string }> = [
  { desc: "Air brake system has a loud air leak at the chamber" },
  { desc: "Brake pads are worn down past the wear indicator" },
  { desc: "Steering wheel has excessive free play, feels loose" },
  { desc: "Front left tire is flat" },
  { desc: "Tire sidewall is cut with exposed cord" },
  { desc: "Driver side headlight is out / inoperative" },
  { desc: "Fifth wheel coupling is loose and damaged" },
  { desc: "King pin appears cracked" },
  { desc: "Diesel fuel leak under the tank" },
  { desc: "Exhaust leak with fumes in cab" },
  { desc: "Windshield crack directly in driver view" },
  { desc: "Windshield wipers not working at all" },
  { desc: "Cracked frame rail near the suspension" },
  { desc: "anything", category: "BRAKE_AIR_LEAK" },
];

describe("GAP-49 major defect catalog", () => {
  it("contains CFR-coded major defects (no duplicates, all cite 396.11)", () => {
    expect(MAJOR_DEFECT_CODES.length).toBeGreaterThanOrEqual(12);
    const codes = MAJOR_DEFECT_CODES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const entry of MAJOR_DEFECT_CODES) {
      expect(entry.cfr).toMatch(/^396\.11/);
      expect(entry.keywords.length).toBeGreaterThan(0);
    }
  });

  // PAUSE condition: classifier must NEVER downgrade a known-major defect.
  it.each(KNOWN_MAJOR_CASES)("classifies known-major as major: %j", ({ desc, category }) => {
    const match = classifyMajorDefect(desc, category);
    expect(match, `expected major for: ${desc}`).not.toBeNull();
    const result = classifyDefect(desc, category);
    expect(result.severity).toBe("major");
    expect(result.major_defect_code).toBeTruthy();
    expect(result.cfr).toMatch(/^396\.11/);
  });

  it("defaults non-catalog defects to minor (never silently observation)", () => {
    const result = classifyDefect("wiper blade leaves minor streaks on glass", "cosmetic");
    expect(result.severity).toBe("minor");
    expect(result.major_defect_code).toBeNull();
  });
});

describe("GAP-49 severity helpers", () => {
  it("validates the three severity levels", () => {
    expect(isValidSeverity("major")).toBe(true);
    expect(isValidSeverity("minor")).toBe(true);
    expect(isValidSeverity("observation")).toBe(true);
    expect(isValidSeverity("critical")).toBe(false);
  });

  it("enforces Manager+ roles for major overrides", () => {
    expect(canOverrideMajor("Owner")).toBe(true);
    expect(canOverrideMajor("Manager")).toBe(true);
    expect(canOverrideMajor("Safety")).toBe(true);
    expect(canOverrideMajor("Driver")).toBe(false);
    expect(canOverrideMajor(null)).toBe(false);
  });
});

type Handler = (sql: string, values?: unknown[]) => { rows: unknown[]; rowCount?: number };

function makeClient(handler: Handler): { client: DbClient; calls: Array<{ sql: string; values?: unknown[] }> } {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const client: DbClient = {
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      return handler(sql, values) as { rows: never[] };
    }),
  };
  return { client, calls };
}

describe("GAP-49 setSeverity (audit-tracked override + RBAC)", () => {
  it("rejects an invalid severity", async () => {
    const { client } = makeClient(() => ({ rows: [] }));
    const res = await setSeverity(client, {
      operatingCompanyId: COMPANY,
      defectId: DEFECT,
      severity: "nope",
      userId: USER,
      role: "Owner",
    });
    expect(res).toEqual({ error: "invalid_severity" });
  });

  it("404s when the defect does not belong to the company", async () => {
    const { client } = makeClient(() => ({ rows: [] }));
    const res = await setSeverity(client, {
      operatingCompanyId: COMPANY,
      defectId: DEFECT,
      severity: "minor",
      userId: USER,
      role: "Owner",
    });
    expect(res).toEqual({ error: "defect_not_found" });
  });

  it("forbids a non-manager from flipping a defect to major", async () => {
    const { client } = makeClient((sql) => {
      if (sql.includes("FROM safety.dvir_defects")) return { rows: [{ id: DEFECT }] };
      if (sql.includes("FROM safety.dvir_defect_severity_tags")) return { rows: [] };
      return { rows: [] };
    });
    const res = await setSeverity(client, {
      operatingCompanyId: COMPANY,
      defectId: DEFECT,
      severity: "major",
      majorDefectCode: "BRAKE_AIR_LEAK",
      userId: USER,
      role: "Driver",
    });
    expect(res).toEqual({ error: "forbidden_major_override" });
  });

  it("requires a valid catalog code when overriding to major", async () => {
    const { client } = makeClient((sql) => {
      if (sql.includes("FROM safety.dvir_defects")) return { rows: [{ id: DEFECT }] };
      if (sql.includes("FROM safety.dvir_defect_severity_tags")) return { rows: [] };
      return { rows: [] };
    });
    const res = await setSeverity(client, {
      operatingCompanyId: COMPANY,
      defectId: DEFECT,
      severity: "major",
      majorDefectCode: "NOT_A_REAL_CODE",
      userId: USER,
      role: "Manager",
    });
    expect(res).toEqual({ error: "major_code_required" });
  });

  it("records a major override as an append-only tag", async () => {
    const { client, calls } = makeClient((sql) => {
      if (sql.includes("FROM safety.dvir_defects")) return { rows: [{ id: DEFECT }] };
      if (sql.includes("FROM safety.dvir_defect_severity_tags")) return { rows: [] };
      if (sql.includes("INSERT INTO safety.dvir_defect_severity_tags")) return { rows: [{ id: "tag-1" }] };
      return { rows: [] };
    });
    const res = await setSeverity(client, {
      operatingCompanyId: COMPANY,
      defectId: DEFECT,
      severity: "major",
      majorDefectCode: "BRAKE_AIR_LEAK",
      userId: USER,
      role: "Manager",
      reason: "confirmed on inspection",
    });
    expect(res).toEqual({ ok: true, tag_id: "tag-1", severity: "major", major_defect_code: "BRAKE_AIR_LEAK" });
    expect(calls.some((c) => c.sql.includes("INSERT INTO safety.dvir_defect_severity_tags"))).toBe(true);
  });

  it("allows any authenticated user to downgrade between minor and observation", async () => {
    const { client } = makeClient((sql) => {
      if (sql.includes("FROM safety.dvir_defects")) return { rows: [{ id: DEFECT }] };
      if (sql.includes("FROM safety.dvir_defect_severity_tags")) return { rows: [{ severity: "minor" }] };
      if (sql.includes("INSERT INTO safety.dvir_defect_severity_tags")) return { rows: [{ id: "tag-2" }] };
      return { rows: [] };
    });
    const res = await setSeverity(client, {
      operatingCompanyId: COMPANY,
      defectId: DEFECT,
      severity: "observation",
      userId: USER,
      role: "Driver",
    });
    expect(res).toEqual({ ok: true, tag_id: "tag-2", severity: "observation", major_defect_code: null });
  });
});
