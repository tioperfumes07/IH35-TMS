import { describe, expect, it } from "vitest";
import type { DriverQualificationFileItem } from "../../api/safety";
import { summarizeDriverDqf } from "../driverDqf";

function item(overrides: Partial<DriverQualificationFileItem>): DriverQualificationFileItem {
  return {
    id: "1",
    driver_id: "d1",
    item_name: "MVR",
    status: "present",
    effective_date: null,
    expiry_date: null,
    notes: null,
    ...overrides,
  };
}

describe("summarizeDriverDqf", () => {
  it("marks empty checklists", () => {
    expect(summarizeDriverDqf([]).level).toBe("empty");
  });

  it("marks compliant when all items are present with green pills", () => {
    const summary = summarizeDriverDqf([item({ expiry_pill: "green" })]);
    expect(summary.level).toBe("compliant");
  });

  it("marks attention when items are missing", () => {
    const summary = summarizeDriverDqf([item({ status: "missing" })]);
    expect(summary.level).toBe("attention");
  });

  it("marks non-compliant when items are expired", () => {
    const summary = summarizeDriverDqf([item({ status: "expired" })]);
    expect(summary.level).toBe("non_compliant");
  });
});
