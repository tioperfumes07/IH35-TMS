import { describe, expect, it } from "vitest";
import { CheckNumberPlanError, MAX_GAP_NUMBERS, planCheckNumbers } from "../check-number-plan.js";

const none = new Set<string>();

describe("U9 planCheckNumbers — proposed at print, editable, continues from what is typed", () => {
  it("proposes the stock's next number and continues the sequence", () => {
    const plan = planCheckNumbers("1001", 3, [], none);
    expect(plan.numbers).toEqual(["1001", "1002", "1003"]);
    expect(plan.gaps).toEqual([]);
    expect(plan.next_after).toBe("1004");
  });

  it("an edited number re-bases every row after it", () => {
    const plan = planCheckNumbers("1001", 4, [null, "1010", "", null], none);
    expect(plan.numbers).toEqual(["1001", "1010", "1011", "1012"]);
    expect(plan.next_after).toBe("1013");
    expect(plan.gaps).toEqual([{ from: "1002", to: "1009", count: 8 }]);
  });

  it("refuses to guess when nothing is on file and nothing is typed", () => {
    expect(() => planCheckNumbers(null, 1, [], none)).toThrow(CheckNumberPlanError);
    expect(planCheckNumbers(null, 2, ["501"], none).numbers).toEqual(["501", "502"]);
  });

  it("reports skipped numbers as gaps, excluding numbers already held", () => {
    const plan = planCheckNumbers("1001", 2, ["1005", "1009"], new Set(["1003"]));
    expect(plan.numbers).toEqual(["1005", "1009"]);
    expect(plan.gaps).toEqual([
      { from: "1001", to: "1002", count: 2 },
      { from: "1004", to: "1004", count: 1 },
      { from: "1006", to: "1008", count: 3 },
    ]);
    expect(plan.gap_count).toBe(6);
  });

  it("a lower typed number fills older stock, makes no gap and never rewinds the sequence", () => {
    const plan = planCheckNumbers("1001", 1, ["950"], none);
    expect(plan.gaps).toEqual([]);
    expect(plan.next_after).toBe("1001");
  });

  it("flags a number used twice inside the batch", () => {
    expect(planCheckNumbers("1001", 3, [null, null, "1001"], none).in_batch_duplicates).toEqual(["1001"]);
  });

  it("normalizes leading zeros and rejects non-numbers", () => {
    expect(planCheckNumbers("1001", 1, ["001001"], none).numbers).toEqual(["1001"]);
    expect(() => planCheckNumbers("1001", 1, ["10A1"], none)).toThrow(/not a check number/);
    expect(() => planCheckNumbers("1001", 1, ["0"], none)).toThrow(/not a check number/);
  });

  it(`refuses a jump that skips more than ${MAX_GAP_NUMBERS} numbers (a typo, not a gap)`, () => {
    expect(() => planCheckNumbers("1001", 1, ["10001"], none)).toThrow(/GAP_TOO_LARGE|skip more than/);
    expect(planCheckNumbers("1001", 1, [String(1001 + MAX_GAP_NUMBERS)], none).gap_count).toBe(MAX_GAP_NUMBERS);
  });
});
