import { describe, expect, it } from "vitest";
import { reconInterestEarnedMemo, reconMemoDate, reconServiceChargeMemo } from "../recon-adjustments.service.js";

// ROUND 390.3 — the memo is for people; the session lives on the spine link, never in the text.
describe("recon adjustment memos", () => {
  it("reads the date the way the owner does", () => {
    expect(reconMemoDate("2025-09-30")).toBe("09/30/2025");
  });
  it("carries no internal id", () => {
    const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    expect(reconServiceChargeMemo("2026-10-01")).toBe("Bank reconciliation service charge — 10/01/2026");
    expect(reconInterestEarnedMemo("2026-10-01")).toBe("Bank reconciliation interest earned — 10/01/2026");
    expect(uuid.test(reconServiceChargeMemo("2026-10-01"))).toBe(false);
    expect(uuid.test(reconInterestEarnedMemo("2026-10-01"))).toBe(false);
  });
});
