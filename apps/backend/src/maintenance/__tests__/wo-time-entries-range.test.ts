import { describe, expect, it } from "vitest";
import { assertManualRange } from "../labor.routes.js";

describe("WO manual time entry range validation (B34 labor.routes)", () => {
  it("accepts equal timestamps", () => expect(assertManualRange("2026-05-01T12:00:00.000Z", "2026-05-01T12:00:00.000Z")).toBe(true));
  it("accepts ordered timestamps", () => expect(assertManualRange("2026-05-01T12:00:00.000Z", "2026-05-01T13:00:00.000Z")).toBe(true));
  it("rejects inverted timestamps", () => expect(assertManualRange("2026-05-01T13:00:00.000Z", "2026-05-01T12:00:00.000Z")).toBe(false));
  it("rejects invalid start", () => expect(assertManualRange("not-a-date", "2026-05-01T12:00:00.000Z")).toBe(false));
});
