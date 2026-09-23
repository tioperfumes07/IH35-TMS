import { describe, expect, it } from "vitest";
import {
  normalizeCandidateName,
  resolveProfileAgainstCandidates,
  resolveProfilesAgainstCandidates,
} from "../resolver.service.js";

// E20 Part A -- NEVER AUTO-MAP. These tests exist specifically to prove the resolver cannot be
// coaxed into picking a winner: exact-name equality only, ambiguity surfaces every candidate
// rather than choosing one, and an empty/unrecognized name never silently resolves to something.
describe("resolveProfileAgainstCandidates", () => {
  it("reports unmatched when no candidate shares the normalized name", () => {
    const verdict = resolveProfileAgainstCandidates({ samsara_driver_id: "1", name: "John Doe" }, []);
    expect(verdict).toEqual({ status: "unmatched" });
  });

  it("reports unmatched, never a guess, for a near-miss name", () => {
    const verdict = resolveProfileAgainstCandidates(
      { samsara_driver_id: "1", name: "Jon Doe" },
      [{ id: "d1", name: "John Doe" }]
    );
    expect(verdict).toEqual({ status: "unmatched" });
  });

  it("matches exactly one candidate on exact normalized-name equality", () => {
    const verdict = resolveProfileAgainstCandidates(
      { samsara_driver_id: "2", name: "  JOHN   doe " },
      [{ id: "d1", name: "John Doe" }]
    );
    expect(verdict).toEqual({ status: "matched", target_id: "d1" });
  });

  it("is punctuation/case insensitive but never fuzzy", () => {
    const verdict = resolveProfileAgainstCandidates(
      { samsara_driver_id: "3", name: "O'Brien, Mary-Jane" },
      [{ id: "d1", name: "O Brien Mary Jane" }]
    );
    expect(verdict.status).toBe("matched");
  });

  it("is AMBIGUOUS, never a pick, when two candidates share the same normalized name", () => {
    const verdict = resolveProfileAgainstCandidates(
      { samsara_driver_id: "4", name: "John Doe" },
      [
        { id: "d1", name: "John Doe" },
        { id: "d2", name: "john   DOE" },
      ]
    );
    expect(verdict).toEqual({ status: "ambiguous", candidate_ids: ["d1", "d2"] });
  });

  it("reports unmatched for an empty/blank profile name rather than matching anything", () => {
    const verdict = resolveProfileAgainstCandidates(
      { samsara_driver_id: "5", name: "   " },
      [{ id: "d1", name: "John Doe" }]
    );
    expect(verdict).toEqual({ status: "unmatched" });
  });
});

describe("resolveProfilesAgainstCandidates (batch)", () => {
  it("resolves each profile independently against the same candidate pool", () => {
    const out = resolveProfilesAgainstCandidates(
      [
        { samsara_driver_id: "a", name: "Jane Roe" },
        { samsara_driver_id: "b", name: "Nobody Here" },
        { samsara_driver_id: "c", name: "Dup Name" },
      ],
      [
        { id: "d1", name: "Jane Roe" },
        { id: "d2", name: "Dup Name" },
        { id: "d3", name: "Dup Name" },
      ]
    );
    expect(out.get("a")).toEqual({ status: "matched", target_id: "d1" });
    expect(out.get("b")).toEqual({ status: "unmatched" });
    expect(out.get("c")).toEqual({ status: "ambiguous", candidate_ids: ["d2", "d3"] });
  });

  it("returns a verdict for every profile, even an all-unmatched population (unmapped is not a defect)", () => {
    const profiles = Array.from({ length: 25 }, (_, i) => ({ samsara_driver_id: `u${i}`, name: `Nobody ${i}` }));
    const out = resolveProfilesAgainstCandidates(profiles, [{ id: "d1", name: "Someone Else" }]);
    expect(out.size).toBe(25);
    for (const verdict of out.values()) {
      expect(verdict.status).toBe("unmatched");
    }
  });
});

describe("normalizeCandidateName", () => {
  it("lowercases, strips punctuation, and collapses whitespace", () => {
    expect(normalizeCandidateName("  O'Brien,  Mary-Jane!! ")).toBe("o brien mary jane");
  });
});
