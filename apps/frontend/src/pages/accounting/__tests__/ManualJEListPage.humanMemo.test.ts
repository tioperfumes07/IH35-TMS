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

  // LV-JE-MEMO-RECORD-NOT-VISIBLE (229-row residual) — void-cancel-executors.ts writes 3 more
  // "Void reversal of X" shapes this list never covered before: expense, bill payment, and
  // customer_payment (memo says "payment"). Plus settlement-posting.service.ts's own
  // "Void reversal of settlement ... posting" shape.
  it("labels a Void reversal of expense memo", () => {
    expect(humanMemo(`Void reversal of expense ${uuid}: owner_void_all_usmca_test`)).toBe(
      "Expense — not visible: owner_void_all_usmca_test"
    );
  });

  it("labels a Void reversal of bill payment memo (not swallowed by the bare 'bill' pattern)", () => {
    expect(humanMemo(`Void reversal of bill payment ${uuid}: owner_void_all_usmca_test`)).toBe(
      "Bill payment — not visible: owner_void_all_usmca_test"
    );
  });

  it("labels a Void reversal of payment (customer_payment) memo", () => {
    expect(humanMemo(`Void reversal of payment ${uuid}: owner_void_all_usmca_test`)).toBe(
      "Payment — not visible: owner_void_all_usmca_test"
    );
  });

  it("labels a Void reversal of settlement posting memo", () => {
    expect(humanMemo(`Void reversal of settlement ${uuid} posting: owner_void_all_usmca_test`)).toBe(
      "Settlement — not visible posting: owner_void_all_usmca_test"
    );
  });

  it("labels a self-referential Reversal of <je> memo", () => {
    expect(humanMemo(`Reversal of ${uuid}`)).toBe("Journal entry — not visible");
  });

  it("keeps the reversal reason and drops the uuid for Reversal of journal entry <uuid>:", () => {
    expect(
      humanMemo(
        `Reversal of journal entry ${uuid}: ACCT-F5674: JE was posted onto a VOIDED sample bank transaction`,
      ),
    ).toBe("Reversal of journal entry: ACCT-F5674: JE was posted onto a VOIDED sample bank transaction");
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

// LV-JE-MEMO-RECORD-NOT-VISIBLE — the real fix: when the backend resolves a human document id for
// the JE's own source_transaction_id (journal-entries.service.ts's JE_SOURCE_TRANSACTION_DISPLAY_ID_SQL),
// humanMemo() must use it instead of the previously-hardcoded null, for every known memo shape.
describe("ManualJEListPage humanMemo — resolved source name (LV-JE-MEMO-RECORD-NOT-VISIBLE)", () => {
  const uuid = "138991fa-2b17-41a0-9c19-ceaf1815d5fa";

  it("resolves the dominant Fuel txn shape to a real unit label instead of tombstoning", () => {
    expect(humanMemo(`Fuel txn ${uuid}`, uuid, "T149")).toBe("T149");
  });

  it("resolves a Bill payment posting memo to a real bill number", () => {
    expect(humanMemo(`Expense ${uuid} posting`, uuid, "EXP-2026-00042")).toBe("EXP-2026-00042 posting");
  });

  it("is case-insensitive matching the resolved source id against the embedded uuid", () => {
    expect(humanMemo(`Reversal of ${uuid.toUpperCase()}`, uuid, "JE-2026-00007")).toBe("JE-2026-00007");
  });

  it("does NOT resolve a uuid that does not match the JE's own source_transaction_id — still tombstones", () => {
    const otherUuid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    expect(humanMemo(`Fuel txn ${uuid}`, otherUuid, "T149")).toBe("Fuel transaction — not visible");
  });

  it("falls back to tombstone when resolvedDisplayId is null even if resolvedSourceId matches (honest gap, e.g. bill_payment/driver_advance not yet covered)", () => {
    expect(humanMemo(`Bill payment ${uuid} posting`, uuid, null)).toBe("Bill payment — not visible posting");
  });
});
