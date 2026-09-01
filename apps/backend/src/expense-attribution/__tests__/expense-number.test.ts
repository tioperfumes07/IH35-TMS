import { describe, expect, it } from "vitest";
import { formatLoadExpenseNumber } from "../expense-number.js";

describe("formatLoadExpenseNumber", () => {
  it("uses the bare load number for the first expense", () => {
    expect(formatLoadExpenseNumber("12225", 1)).toBe("12225");
  });

  it("suffixes from the second expense as loadNumber-(seq-1)", () => {
    expect(formatLoadExpenseNumber("12225", 2)).toBe("12225-1");
    expect(formatLoadExpenseNumber("12225", 3)).toBe("12225-2");
  });

  it("rejects a non-positive sequence", () => {
    expect(() => formatLoadExpenseNumber("12225", 0)).toThrow("expense_sequence_failed");
  });
});
