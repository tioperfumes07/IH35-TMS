import { describe, expect, it } from "vitest";
import { humanMemo } from "../ManualJEListPage";

// ACCT-F5608 — before this fix, EVERY one of these produced a garbled double-noun string like
// "Fuel txn Record — not visible" (the original type word AND the always-generic "Record" fallback
// both survived the substitution). Each case here is a real memo shape confirmed live on prod
// (tiny-field-89581227, 2026-08-20) -- "Fuel txn <uuid>" alone is 1,557 of 1,930 posted JEs (82.6%).
describe("ManualJEListPage humanMemo", () => {
  const uuid = "138991fa-2b17-41a0-9c19-ceaf1815d5fa";

  it("labels the dominant Fuel txn shape with a specific noun, not the generic fallback", () => {
    expect(humanMemo(`Fuel txn ${uuid}`)).toBe("Fuel transaction — not visible");
  });

  it("labels an Expense posting memo", () => {
    expect(humanMemo(`Expense ${uuid} posting`)).toBe("Expense — not visible posting");
  });

  it("labels a Bill payment posting memo", () => {
    expect(humanMemo(`Bill payment ${uuid} posting`)).toBe("Bill payment — not visible posting");
  });

  it("labels a Driver advance posting memo", () => {
    expect(humanMemo(`Driver advance ${uuid} posting`)).toBe("Driver advance — not visible posting");
  });

  it("labels the Bank categorization fallback-format memo (no embedded description)", () => {
    expect(humanMemo(`Bank categorization ${uuid} posting`)).toBe("Bank transaction — not visible posting");
  });

  it("labels a Void reversal of bill memo, preserving the trailing reason text", () => {
    expect(humanMemo(`Void reversal of bill ${uuid}: ACCT-F330 — restore GL reversal`)).toBe(
      "Bill — not visible: ACCT-F330 — restore GL reversal"
    );
  });

  it("labels a Void reversal of invoice memo", () => {
    expect(humanMemo(`Void reversal of invoice ${uuid}: owner_void_all_usmca_test`)).toBe(
      "Invoice — not visible: owner_void_all_usmca_test"
    );
  });

  it("labels a self-referential Reversal of <je> memo", () => {
    expect(humanMemo(`Reversal of ${uuid}`)).toBe("Journal entry — not visible");
  });

  it("falls back to the generic Record label for an unrecognized memo shape", () => {
    expect(humanMemo(`Something new ${uuid} happened`)).toBe("Something new Record — not visible happened");
  });

  it("passes through memos with no embedded uuid unchanged", () => {
    expect(humanMemo("Manual adjustment for October close")).toBe("Manual adjustment for October close");
  });

  it("returns the em dash placeholder for empty/null memos", () => {
    expect(humanMemo(null)).toBe("—");
    expect(humanMemo("")).toBe("—");
  });
});
