import { describe, expect, it } from "vitest";
import { REPORT_CATEGORIES, allCatalogReportIds } from "../category-catalog.js";

describe("report category catalog (GAP-41)", () => {
  it("defines exactly 9 WF-061 categories", () => {
    expect(REPORT_CATEGORIES).toHaveLength(9);
    expect(REPORT_CATEGORIES.map((c) => c.id)).toEqual([
      "ops-dispatch",
      "driver-perf",
      "equipment",
      "safety",
      "customers",
      "vendors",
      "accounting",
      "tax-reg",
      "multi-company",
    ]);
  });

  it("assigns every report an id and route", () => {
    const ids = allCatalogReportIds();
    expect(ids.length).toBeGreaterThan(10);
    expect(new Set(ids).size).toBe(ids.length);
    for (const category of REPORT_CATEGORIES) {
      for (const report of category.reports) {
        expect(report.route.startsWith("/reports")).toBe(true);
      }
    }
  });
});
