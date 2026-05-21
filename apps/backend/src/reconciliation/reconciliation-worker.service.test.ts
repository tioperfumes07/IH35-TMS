import { describe, expect, it } from "vitest";
import { calculateDriftPct, transactionalDriftSeverity } from "./reconciliation-worker.service.js";

describe("reconciliation-worker.service", () => {
  it("calculates percentage drift against max count baseline", () => {
    expect(calculateDriftPct(100, 110)).toBeCloseTo(10 / 110, 8);
    expect(calculateDriftPct(0, 0)).toBe(0);
    expect(calculateDriftPct(0, 12)).toBe(1);
  });

  it("applies transactional threshold defaults from DD-4", () => {
    expect(transactionalDriftSeverity(1000, 1005)).toBeNull();
    expect(transactionalDriftSeverity(1000, 1015)).toBe("important");
    expect(transactionalDriftSeverity(1000, 1050)).toBe("critical");
  });
});
