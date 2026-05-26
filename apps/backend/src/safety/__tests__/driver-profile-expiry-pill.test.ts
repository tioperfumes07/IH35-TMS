import { describe, expect, it } from "vitest";

function expiryPill(daysToExpiry: number | null) {
  if (daysToExpiry == null) return "unknown";
  if (daysToExpiry < 0) return "red";
  if (daysToExpiry <= 30) return "amber";
  return "green";
}

describe("driver profile expiry pill", () => {
  it("returns red for expired documents", () => {
    expect(expiryPill(-1)).toBe("red");
  });

  it("returns amber for soon to expire documents", () => {
    expect(expiryPill(15)).toBe("amber");
  });

  it("returns green for valid documents", () => {
    expect(expiryPill(60)).toBe("green");
  });
});
