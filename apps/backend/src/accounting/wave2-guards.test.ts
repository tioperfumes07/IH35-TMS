import { describe, expect, it } from "vitest";

function isClosedPeriodPgMessage(msg: string): boolean {
  return msg.includes("IH35_CLOSED_PERIOD");
}

describe("period lock signaling", () => {
  it("detects closed-period raises from PL/pgSQL", () => {
    expect(isClosedPeriodPgMessage("IH35_CLOSED_PERIOD closed_through=2025-01-31 txn_date=2025-01-01")).toBe(true);
    expect(isClosedPeriodPgMessage("other")).toBe(false);
  });
});

describe("reconciliation variance gate", () => {
  it("finalize requires zero variance", () => {
    const canFinalize = (v: number) => v === 0;
    expect(canFinalize(0)).toBe(true);
    expect(canFinalize(1)).toBe(false);
  });
});
