import { describe, expect, it, vi } from "vitest";
import { formatLastLoginAt } from "./formatLastLoginAt";

describe("formatLastLoginAt", () => {
  it('returns "Never" when last_login_at is null', () => {
    expect(formatLastLoginAt(null)).toBe("Never");
    expect(formatLastLoginAt(undefined)).toBe("Never");
  });

  it("returns a relative time string when last_login_at is set", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-02T14:00:00.000Z"));

    expect(formatLastLoginAt("2026-06-02T12:00:00.000Z")).toBe("2 hours ago");
    expect(formatLastLoginAt("2026-06-01T14:00:00.000Z")).toBe("Yesterday");
    expect(formatLastLoginAt("2026-05-30T14:00:00.000Z")).toBe("3 days ago");

    vi.useRealTimers();
  });
});
