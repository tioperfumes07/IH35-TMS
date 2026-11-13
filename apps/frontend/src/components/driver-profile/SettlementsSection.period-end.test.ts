import { describe, expect, it } from "vitest";
import source from "./SettlementsSection.tsx?raw";

describe("SettlementsSection Period End (board11)", () => {
  it("formats week_ending with formatDateUS (not raw YYYY-MM-DD String())", () => {
    expect(source).toMatch(/formatDateUS\(row\.week_ending\)/);
    expect(source).not.toMatch(/String\(row\.week_ending/);
  });
});
