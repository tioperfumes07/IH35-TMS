import { describe, expect, it } from "vitest";
import { normalizeSessionDiffFindings } from "../session.service.js";

const canonicalFinding = {
  angle_label: "front",
  pre_evidence_uuid: "11111111-1111-4111-8111-111111111111",
  post_evidence_uuid: "22222222-2222-4222-8222-222222222222",
  has_new_damage: false,
  findings: [],
};

describe("photo comparison findings contract", () => {
  it("preserves canonical evidence arrays", () => {
    expect(normalizeSessionDiffFindings("clean", [canonicalFinding])).toEqual([canonicalFinding]);
  });

  it("normalizes the legacy empty object only before a verdict exists", () => {
    expect(normalizeSessionDiffFindings("pending", {})).toBeNull();
    expect(normalizeSessionDiffFindings("analyzing", {})).toBeNull();
  });

  it("fails closed when completed evidence has a non-array shape", () => {
    expect(() => normalizeSessionDiffFindings("manual_override", {})).toThrow(
      "photo_comparison_diff_findings_invalid"
    );
  });
});
