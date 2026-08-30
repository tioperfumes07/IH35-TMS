import { describe, expect, it } from "vitest";
import { readAngleFindings } from "./SessionDetail";

function session(diffStatus: string, diffFindings: unknown) {
  return {
    diff_status: diffStatus,
    diff_findings: diffFindings,
  } as Parameters<typeof readAngleFindings>[0];
}

describe("readAngleFindings", () => {
  it("does not crash on the legacy pending empty-object shape", () => {
    expect(readAngleFindings(session("pending", {}))).toEqual({ findings: [], invalid: false });
  });

  it("marks malformed completed evidence instead of silently emptying it", () => {
    expect(readAngleFindings(session("manual_override", {}))).toEqual({ findings: [], invalid: true });
  });

  it("returns canonical arrays", () => {
    const findings = [{ angle_label: "front", has_new_damage: false, findings: [] }];
    expect(readAngleFindings(session("clean", findings))).toEqual({ findings, invalid: false });
  });
});
