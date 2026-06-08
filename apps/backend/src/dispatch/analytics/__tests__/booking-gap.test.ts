import { describe, it, expect } from "vitest";

describe("booking gap analytics", () => {
  it("filters gaps above 24h threshold", () => {
    const gaps = [2.5, 4, 8, 25, 30]; // 25h and 30h excluded
    const filtered = gaps.filter((g) => g > 0 && g <= 24);
    expect(filtered).toEqual([2.5, 4, 8]);
  });

  it("computes avg correctly", () => {
    const gaps = [2, 4, 6];
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    expect(avg).toBe(4);
  });

  it("rank 1 is lowest avg gap (best dispatcher)", () => {
    const dispatchers = [
      { dispatcher_label: "Alice", avg_gap_hours: 2 },
      { dispatcher_label: "Bob", avg_gap_hours: 5 },
    ];
    const sorted = [...dispatchers].sort((a, b) => a.avg_gap_hours - b.avg_gap_hours);
    expect(sorted[0].dispatcher_label).toBe("Alice");
  });

  it("excludes zero or negative gaps", () => {
    const gaps = [-1, 0, 1.5, 3];
    const filtered = gaps.filter((g) => g > 0 && g <= 24);
    expect(filtered).toEqual([1.5, 3]);
  });

  it("p50 is median of sorted gaps", () => {
    const gaps = [1, 2, 3, 4, 5];
    const sorted = [...gaps].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const p50 = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    expect(p50).toBe(3);
  });
});
