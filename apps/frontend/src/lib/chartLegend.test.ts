import { describe, expect, it } from "vitest";
import { formatChartLegendLabel, formatWoStatusLabel } from "./chartLegend";

describe("formatChartLegendLabel", () => {
  it("maps missing and undefined strings to Unknown", () => {
    expect(formatChartLegendLabel(undefined)).toBe("Unknown");
    expect(formatChartLegendLabel("undefined")).toBe("Unknown");
    expect(formatChartLegendLabel("  Parts  ")).toBe("Parts");
  });
});

describe("formatWoStatusLabel", () => {
  it("formats WO status buckets for legend and tooltip", () => {
    expect(formatWoStatusLabel(undefined)).toBe("Unknown");
    expect(formatWoStatusLabel("in_progress")).toBe("in progress");
  });
});
