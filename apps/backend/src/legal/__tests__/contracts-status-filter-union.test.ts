import { describe, expect, it } from "vitest";
import { parseContractInstanceStatusFilter } from "../contracts.service.js";

describe("parseContractInstanceStatusFilter — Codex batch67 sibling", () => {
  it("parses comma-union and drops unknown tokens", () => {
    expect(parseContractInstanceStatusFilter("draft,sent,draft,not_real,voided")).toEqual([
      "draft",
      "sent",
      "voided",
    ]);
  });

  it("returns empty for blank input", () => {
    expect(parseContractInstanceStatusFilter(undefined)).toEqual([]);
    expect(parseContractInstanceStatusFilter("")).toEqual([]);
  });
});
