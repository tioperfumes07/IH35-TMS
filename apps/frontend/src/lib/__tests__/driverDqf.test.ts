import { describe, expect, it } from "vitest";
import type { DriverQualificationFileItem } from "../../api/safety";
import { summarizeDriverDqf } from "../driverDqf";

const DQF_ITEM_DEFAULTS: DriverQualificationFileItem = {
  id: "1",
  driver_id: "d1",
  item_name: "MVR",
  required_document_type_id: null,
  required_document_type_code: null,
  required_document_type_label: "MVR",
  required_document_type_authority: null,
  status: "present",
  effective_date: null,
  expiry_date: null,
  executed_at: null,
  removable_after: null,
  retain_until: null,
  notes: null,
};

function item(overrides: Partial<DriverQualificationFileItem> = {}): DriverQualificationFileItem {
  const next: DriverQualificationFileItem = { ...DQF_ITEM_DEFAULTS };
  for (const key of Object.keys(overrides) as (keyof DriverQualificationFileItem)[]) {
    const value = overrides[key];
    if (value !== undefined) {
      (next[key] as DriverQualificationFileItem[typeof key]) = value;
    }
  }
  return next;
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
