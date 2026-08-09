import { describe, expect, it } from "vitest";
import { toYmd } from "./TaskPlannerGrid";

describe("toYmd (FAIL-TSK1)", () => {
  it("keeps plain YYYY-MM-DD", () => {
    expect(toYmd("2026-08-08")).toBe("2026-08-08");
  });

  it("strips ISO timestamps so day-cell match works", () => {
    expect(toYmd("2026-08-08T00:00:00.000Z")).toBe("2026-08-08");
    expect(toYmd("2026-08-08T05:00:00.000Z")).toBe("2026-08-08");
  });

  it("returns empty for nullish", () => {
    expect(toYmd(null)).toBe("");
    expect(toYmd(undefined)).toBe("");
  });
});
