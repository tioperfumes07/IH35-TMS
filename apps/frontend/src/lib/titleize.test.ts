import { describe, expect, it } from "vitest";
import { titleize } from "./titleize";

describe("titleize", () => {
  it("converts a snake_case DB token to a Title Case label", () => {
    expect(titleize("net_30")).toBe("Net 30");
    expect(titleize("in_progress")).toBe("In Progress");
    expect(titleize("waiting_parts")).toBe("Waiting Parts");
  });

  it("handles hyphens and mixed separators", () => {
    expect(titleize("on-hold")).toBe("On Hold");
    expect(titleize("a_b-c")).toBe("A B C");
  });

  it("returns empty string for null/undefined/empty input", () => {
    expect(titleize(null)).toBe("");
    expect(titleize(undefined)).toBe("");
    expect(titleize("")).toBe("");
    expect(titleize("   ")).toBe("");
  });

  it("is a no-op for an already-human label", () => {
    expect(titleize("Active")).toBe("Active");
  });
});
