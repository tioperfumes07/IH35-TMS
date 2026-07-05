import { describe, expect, it } from "vitest";
import { compareRows, deriveLifecycle, isOpenStatus, lifecycleRank, reviewTag, summarizePending } from "./ProgramBoardPage";

// Minimal Row builder for compareRows tests — overrides only the fields under test.
function mkRow(over: Partial<Parameters<typeof compareRows>[0]>): Parameters<typeof compareRows>[0] {
  return {
    key: over.id ? `block:${over.id}` : "block:x",
    id: "X",
    date: null,
    wave: "",
    description: "",
    tier: "",
    fin: false,
    status: "PENDING",
    pr: null,
    track: "block",
    ...over,
  };
}

// Every data column is sortable and each comparator is type-correct (dates chronological, PR # numeric,
// Fin boolean, id/tier numeric-aware). A naive string compare would mis-order "#10" vs "#9" and dates.
describe("compareRows", () => {
  const asc = (a: Parameters<typeof compareRows>[0], b: Parameters<typeof compareRows>[0], k: Parameters<typeof compareRows>[2]) =>
    Math.sign(compareRows(a, b, k));

  it("sorts PR numbers numerically, not lexicographically", () => {
    expect(asc(mkRow({ pr: 9 }), mkRow({ pr: 10 }), "pr")).toBe(-1); // 9 < 10 (string compare would flip this)
    expect(asc(mkRow({ pr: 100 }), mkRow({ pr: 20 }), "pr")).toBe(1);
    expect(asc(mkRow({ pr: null }), mkRow({ pr: 1 }), "pr")).toBe(-1); // null sorts first ascending
  });

  it("sorts dates chronologically", () => {
    expect(asc(mkRow({ date: "2026-01-02" }), mkRow({ date: "2026-06-30" }), "date")).toBe(-1);
    expect(asc(mkRow({ date: "2026-06-30" }), mkRow({ date: "2026-01-02" }), "date")).toBe(1);
    expect(asc(mkRow({ date: null }), mkRow({ date: "2025-01-01" }), "date")).toBe(-1);
  });

  it("sorts Fin as a boolean (financial rows group together)", () => {
    expect(asc(mkRow({ fin: false }), mkRow({ fin: true }), "fin")).toBe(-1);
    expect(asc(mkRow({ fin: true }), mkRow({ fin: true }), "fin")).toBe(0);
  });

  it("uses numeric-aware string compare for ids so P3-T11.2 sorts before P3-T11.10", () => {
    expect(asc(mkRow({ id: "P3-T11.2" }), mkRow({ id: "P3-T11.10" }), "id")).toBe(-1);
  });

  it("sorts the Review tag column", () => {
    expect(asc(mkRow({ review: "needs-your-preview" }), mkRow({ review: undefined }), "review")).toBe(-1);
  });

  it("sorts the Lifecycle column by pipeline stage, not alphabetically", () => {
    // written(1) < deployed(3) even though "deployed" < "written" alphabetically
    expect(asc(mkRow({ lifecycle: "written" }), mkRow({ lifecycle: "deployed" }), "lifecycle")).toBe(-1);
    // absent lifecycle → derived from timestamps; deployed outranks merged
    expect(asc(mkRow({ mergedCt: "x" }), mkRow({ deployedCt: "x", mergedCt: "x" }), "lifecycle")).toBe(-1);
  });
});

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

// Lifecycle timeline (Jorge's core ask): requested → written → merged → deployed. A row is only fully
// live once deployed is reached — merged ≠ live.
describe("lifecycleRank", () => {
  it("orders the pipeline stages and puts unknown/absent first", () => {
    expect(lifecycleRank("requested")).toBe(0);
    expect(lifecycleRank("written")).toBe(1);
    expect(lifecycleRank("merged")).toBe(2);
    expect(lifecycleRank("deployed")).toBe(3);
    expect(lifecycleRank("DEPLOYED")).toBe(3); // case-insensitive
    expect(lifecycleRank(undefined)).toBe(-1);
    expect(lifecycleRank("nonsense")).toBe(-1);
    expect(lifecycleRank("deployed")).toBeGreaterThan(lifecycleRank("merged")); // merged is not yet "done"
  });
});

describe("deriveLifecycle", () => {
  it("prefers an explicit lifecycle when present", () => {
    expect(deriveLifecycle({ lifecycle: "Merged", deployedCt: "2026-07-05T00:00:00Z" })).toBe("merged");
  });
  it("derives the furthest reached stage from the timestamps", () => {
    expect(deriveLifecycle({ deployedCt: "x", mergedCt: "x", writtenCt: "x", requestedCt: "x" })).toBe("deployed");
    expect(deriveLifecycle({ mergedCt: "x", writtenCt: "x" })).toBe("merged");
    expect(deriveLifecycle({ writtenCt: "x" })).toBe("written");
    expect(deriveLifecycle({ requestedCt: "x" })).toBe("requested");
  });
  it("returns undefined when nothing is stamped (graceful absence)", () => {
    expect(deriveLifecycle({})).toBeUndefined();
  });
});
