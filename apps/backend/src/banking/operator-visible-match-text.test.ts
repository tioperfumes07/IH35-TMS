/**
 * Unit tests for operatorVisibleMatchText (433-CUR B7).
 */
import { describe, expect, it } from "vitest";
import { operatorVisibleMatchText } from "./operator-visible-match-text.js";

describe("operatorVisibleMatchText", () => {
  it("strips the exact owner-seen recon SC junk", () => {
    expect(
      operatorVisibleMatchText("Bank reconciliation service charge · session 7a7d1da9-aa5b-4de7-b0c1-2d3e4f5a6b7c"),
    ).toBe("Bank reconciliation service charge");
  });

  it("strips a bare UUID anywhere in the string", () => {
    expect(operatorVisibleMatchText("Expense a1b2c3d4-e5f6-7890-abcd-ef1234567890 posting")).toBe("Expense posting");
  });

  it("strips a trailing 8-hex sourceId.slice suffix", () => {
    expect(operatorVisibleMatchText("Bank categorization: WIRE FEE a1b2c3d4")).toBe("Bank categorization: WIRE FEE");
  });

  it("leaves a clean human memo alone", () => {
    expect(operatorVisibleMatchText("Bank reconciliation service charge — 10/01/2026")).toBe(
      "Bank reconciliation service charge — 10/01/2026",
    );
  });

  it("returns empty for null/undefined", () => {
    expect(operatorVisibleMatchText(null)).toBe("");
    expect(operatorVisibleMatchText(undefined)).toBe("");
  });
});
