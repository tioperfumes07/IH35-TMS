import { afterEach, describe, expect, it, vi } from "vitest";
import { computeAccountingBackoffIsoAfterIncrement } from "../sync-outbound-accounting.js";

describe("computeAccountingBackoffIsoAfterIncrement", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses min(60 * 2^(n+1), 3600) seconds from incremented logical attempt", () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-05-12T12:00:00.000Z").getTime());
    const iso = computeAccountingBackoffIsoAfterIncrement(0);
    expect(iso).toBe(new Date("2026-05-12T12:02:00.000Z").toISOString());
  });

  it("caps at one hour", () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-05-12T12:00:00.000Z").getTime());
    const iso = computeAccountingBackoffIsoAfterIncrement(12);
    expect(iso).toBe(new Date("2026-05-12T13:00:00.000Z").toISOString());
  });
});
