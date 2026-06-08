import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock auth module
vi.mock("../../../../auth/db.js", () => ({
  withCurrentUser: vi.fn(async (_userId, fn) => fn({ query: mockQuery })),
  withLuciaBypass: vi.fn(async (fn) => fn({ query: mockQuery })),
}));

const mockQuery = vi.fn();

beforeEach(() => {
  mockQuery.mockReset();
});

import { computeNextGenerationDate } from "../generator.service.js";

describe("computeNextGenerationDate", () => {
  it("advances weekly by 7 days", () => {
    expect(computeNextGenerationDate("2026-06-07", "weekly")).toBe("2026-06-14");
  });

  it("advances biweekly by 14 days", () => {
    expect(computeNextGenerationDate("2026-06-07", "biweekly")).toBe("2026-06-21");
  });

  it("advances monthly by one calendar month", () => {
    expect(computeNextGenerationDate("2026-01-31", "monthly")).toBe("2026-02-28");
  });

  it("advances quarterly by 3 months", () => {
    expect(computeNextGenerationDate("2026-01-15", "quarterly")).toBe("2026-04-15");
  });

  it("advances annually by 1 year", () => {
    expect(computeNextGenerationDate("2026-06-07", "annually")).toBe("2027-06-07");
  });

  it("throws on unknown frequency", () => {
    expect(() => computeNextGenerationDate("2026-06-07", "daily")).toThrow("recurring_bill_unknown_frequency");
  });

  it("throws on invalid date", () => {
    expect(() => computeNextGenerationDate("not-a-date", "monthly")).toThrow("recurring_bill_invalid_date");
  });
});

describe("deactivateTemplate — no-delete enforcement", () => {
  it("does not contain DELETE SQL", async () => {
    // Read the source to ensure DELETE is not present
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { resolve, dirname } = await import("node:path");
    const src = resolve(dirname(fileURLToPath(import.meta.url)), "../template.service.ts");
    const content = readFileSync(src, "utf8");
    expect(content).not.toMatch(/DELETE FROM accounting\.recurring_bill_templates/);
    expect(content).toMatch(/is_active = false/);
  });
});
