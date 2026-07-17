import { describe, expect, it } from "vitest";
import { effectiveQboLastSuccessAt, formatQboLastSuccessLabel } from "./qbo-sync-last-success-label";

describe("qbo-sync-last-success-label", () => {
  it("picks the most recent successful sync across push and master-data sources", () => {
    expect(
      effectiveQboLastSuccessAt("2026-07-10T12:00:00.000Z", "2026-07-15T12:00:00.000Z")
    ).toBe("2026-07-15T12:00:00.000Z");
    expect(effectiveQboLastSuccessAt(null, "2026-07-15T12:00:00.000Z")).toBe("2026-07-15T12:00:00.000Z");
    expect(effectiveQboLastSuccessAt(null, null)).toBeNull();
  });

  it("formats never when no timestamp", () => {
    expect(formatQboLastSuccessLabel(null)).toBe("Last OK: never");
  });

  it("formats a readable last-ok label", () => {
    const label = formatQboLastSuccessLabel("2026-07-15T18:30:00.000Z");
    expect(label.startsWith("Last OK:")).toBe(true);
    expect(label).not.toBe("Last OK: never");
  });
});
