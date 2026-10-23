import { describe, expect, it } from "vitest";
import { entityIdFilterSchema, entityIdFilterValues } from "./entity-filter-list.js";
const a = "00000000-0000-4000-8000-000000000001";
const b = "00000000-0000-4000-8000-000000000002";
describe("entity filter lists", () => {
  it("preserves legacy links and normalizes multiple ids", () => {
    expect(entityIdFilterValues(a)).toEqual([a]);
    expect(entityIdFilterValues(`${a}, ${b},${a}`)).toEqual([a, b]);
  });
  it("rejects malformed, empty and oversized lists instead of dropping values", () => {
    for (const value of ["", `${a},`, `${a},not-an-id`, `${a}');DROP TABLE x;--`, Array(101).fill(a).join(",")]) {
      expect(entityIdFilterSchema.safeParse(value).success).toBe(false);
    }
  });
});
