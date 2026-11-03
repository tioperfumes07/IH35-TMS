import { describe, expect, it } from "vitest";
import { parseTemplateStatusFilter } from "../templates.service.js";

describe("parseTemplateStatusFilter — Codex batch67 sibling", () => {
  it("parses comma-union and drops unknown tokens", () => {
    expect(parseTemplateStatusFilter("draft,active,draft,bogus,retired")).toEqual([
      "draft",
      "active",
      "retired",
    ]);
  });

  it("returns empty for blank input", () => {
    expect(parseTemplateStatusFilter(undefined)).toEqual([]);
    expect(parseTemplateStatusFilter("")).toEqual([]);
  });
});
