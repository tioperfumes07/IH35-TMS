import { describe, expect, it } from "vitest";
import { normalizeHistoryLimit } from "../vehicle-locations.service.js";

describe("position history pagination", () => {
  it("clamps history limit and defaults safely", () => {
    expect(normalizeHistoryLimit(undefined)).toBe(500);
    expect(normalizeHistoryLimit(0)).toBe(1);
    expect(normalizeHistoryLimit(25)).toBe(25);
    expect(normalizeHistoryLimit(99999)).toBe(5000);
  });
});
