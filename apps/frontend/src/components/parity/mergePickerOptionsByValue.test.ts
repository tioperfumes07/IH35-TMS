import { describe, expect, it } from "vitest";
import { mergePickerOptionsByValue } from "./mergePickerOptionsByValue";

describe("mergePickerOptionsByValue", () => {
  it("renders a newly created FK only once after the canonical roster refetches", () => {
    expect(
      mergePickerOptionsByValue(
        [{ value: "vendor-1", label: "Canonical Vendor" }],
        [{ value: "vendor-1", label: "Optimistic Vendor" }],
      ),
    ).toEqual([{ value: "vendor-1", label: "Canonical Vendor" }]);
  });

  it("keeps optimistic rows until the canonical roster contains them", () => {
    expect(
      mergePickerOptionsByValue(
        [{ value: "vendor-1", label: "Existing" }],
        [{ value: "vendor-2", label: "Just Created" }],
      ),
    ).toHaveLength(2);
  });
});
