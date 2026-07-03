import { describe, expect, it } from "vitest";
import { isOpenStatus, reviewTag, summarizePending } from "./ProgramBoardPage";

// Owner-Batch review tag defaulting (Jorge 2026-07-03): any row without an explicit tag is proceed-on-row;
// only an explicit "needs-your-preview" opts into the preview-first path.
describe("reviewTag", () => {
  it("defaults absent/blank/unknown to proceed-on-row", () => {
    for (const v of [undefined, "", "  ", "whatever", "PROCEED-ON-ROW"]) {
      expect(reviewTag(v)).toBe("proceed-on-row");
    }
  });
  it("honors an explicit needs-your-preview (case/space-insensitive)", () => {
    expect(reviewTag("needs-your-preview")).toBe("needs-your-preview");
    expect(reviewTag("  Needs-Your-Preview ")).toBe("needs-your-preview");
  });
});

// Real reconcile-JSON status vocabulary: PENDING / PENDING (GATED) / NEEDS-VERIFY / OPEN / DONE.
describe("isOpenStatus", () => {
  it("treats DONE as the only concluded status", () => {
    expect(isOpenStatus("DONE")).toBe(false);
    expect(isOpenStatus("done")).toBe(false);
  });

  it("treats every not-done state as open", () => {
    for (const s of ["PENDING", "PENDING (GATED)", "NEEDS-VERIFY", "OPEN", ""]) {
      expect(isOpenStatus(s)).toBe(true);
    }
  });
});

describe("summarizePending", () => {
  it("buckets statuses and derives the completion metric", () => {
    const statuses = [
      ...Array(420).fill("DONE"),
      ...Array(4).fill("PENDING"),
      ...Array(24).fill("PENDING (GATED)"),
      ...Array(19).fill("NEEDS-VERIFY"),
      "OPEN",
    ];
    const s = summarizePending(statuses);
    expect(s.done).toBe(420);
    expect(s.gated).toBe(24);
    expect(s.needsVerify).toBe(19);
    expect(s.pending).toBe(5); // 4 PENDING + 1 OPEN
    expect(s.total).toBe(468);
    expect(s.open).toBe(48); // total - done
    // open count must always equal the sum of the not-done buckets
    expect(s.open).toBe(s.pending + s.gated + s.needsVerify);
    expect(s.pct).toBe(Math.round((420 / 468) * 100));
  });

  it("is safe on an empty set", () => {
    const s = summarizePending([]);
    expect(s).toEqual({ pending: 0, gated: 0, needsVerify: 0, done: 0, open: 0, total: 0, pct: 0 });
  });
});
