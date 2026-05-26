import { describe, expect, it } from "vitest";

type EventRow = {
  voided_at: string | null;
  voided_reason: string | null;
};

function canVoid(row: EventRow) {
  if (row.voided_at) return false;
  return true;
}

describe("safety events permanent record policy", () => {
  it("allows first-time void transitions", () => {
    expect(canVoid({ voided_at: null, voided_reason: null })).toBe(true);
  });

  it("blocks second void transitions", () => {
    expect(canVoid({ voided_at: "2026-05-26T00:00:00Z", voided_reason: "duplicate" })).toBe(false);
  });
});
