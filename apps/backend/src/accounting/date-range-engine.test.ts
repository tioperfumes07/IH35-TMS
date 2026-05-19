import { describe, expect, it } from "vitest";
import { resolveCustomDateRange, resolveRelativeDateRange } from "./date-range-engine.js";

describe("date-range-engine relative presets", () => {
  const reference = "2026-05-19";

  it("resolves all locked presets for reference 2026-05-19", () => {
    expect(resolveRelativeDateRange("this_month", { reference_date: reference })).toMatchObject({
      from_date: "2026-05-01",
      to_date: "2026-05-31",
    });
    expect(resolveRelativeDateRange("last_month", { reference_date: reference })).toMatchObject({
      from_date: "2026-04-01",
      to_date: "2026-04-30",
    });
    expect(resolveRelativeDateRange("this_quarter", { reference_date: reference })).toMatchObject({
      from_date: "2026-04-01",
      to_date: "2026-06-30",
    });
    expect(resolveRelativeDateRange("last_quarter", { reference_date: reference })).toMatchObject({
      from_date: "2026-01-01",
      to_date: "2026-03-31",
    });
    expect(resolveRelativeDateRange("this_year", { reference_date: reference })).toMatchObject({
      from_date: "2026-01-01",
      to_date: "2026-12-31",
    });
    expect(resolveRelativeDateRange("year_to_date", { reference_date: reference })).toMatchObject({
      from_date: "2026-01-01",
      to_date: "2026-05-19",
    });
    expect(resolveRelativeDateRange("last_year", { reference_date: reference })).toMatchObject({
      from_date: "2025-01-01",
      to_date: "2025-12-31",
    });
    expect(resolveRelativeDateRange("all_time", { reference_date: reference })).toMatchObject({
      from_date: null,
      to_date: "2026-05-19",
    });
  });

  it("handles February month-end in non-leap year", () => {
    const range = resolveRelativeDateRange("this_month", { reference_date: "2026-02-10" });
    expect(range.from_date).toBe("2026-02-01");
    expect(range.to_date).toBe("2026-02-28");
  });

  it("handles February month-end in leap year", () => {
    const range = resolveRelativeDateRange("this_month", { reference_date: "2024-02-10" });
    expect(range.from_date).toBe("2024-02-01");
    expect(range.to_date).toBe("2024-02-29");
  });
});

describe("date-range-engine custom range", () => {
  it("rejects custom range with from_date after to_date", () => {
    expect(() => resolveCustomDateRange({ from_date: "2026-05-19", to_date: "2026-05-18" })).toThrow(
      "invalid_custom_range_order"
    );
  });
});
