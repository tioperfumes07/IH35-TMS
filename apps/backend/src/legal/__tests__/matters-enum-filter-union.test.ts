import { describe, expect, it } from "vitest";
import { parseMatterEnumFilter } from "../matters.service.js";

const STATUS = ["open", "investigating", "litigation", "settled", "dismissed", "judgment", "closed"] as const;

describe("parseMatterEnumFilter — Codex batch67 multi-status union", () => {
  it("returns empty for blank / undefined", () => {
    expect(parseMatterEnumFilter(undefined, STATUS)).toEqual([]);
    expect(parseMatterEnumFilter("", STATUS)).toEqual([]);
    expect(parseMatterEnumFilter("   ", STATUS)).toEqual([]);
  });

  it("accepts a single allowlisted token", () => {
    expect(parseMatterEnumFilter("open", STATUS)).toEqual(["open"]);
  });

  it("parses comma-union, de-dupes, drops unknown tokens", () => {
    expect(parseMatterEnumFilter("open,settled,open,not_a_status,litigation", STATUS)).toEqual([
      "open",
      "settled",
      "litigation",
    ]);
  });
});
