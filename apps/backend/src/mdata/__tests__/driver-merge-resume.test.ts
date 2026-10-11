import { describe, expect, it } from "vitest";
import { previewDriverMerge } from "../driver-merge.service.js";

// Lead 443.45: a profile an earlier merge left pointing at its survivor (but still Active, with references) is finished by
// THIS engine with `resume` — and only for that same survivor; an already-merged profile is never re-targeted.
const S = "11111111-1111-4111-8111-111111111111";
const M = "22222222-2222-4222-8222-222222222222";
const X = "33333333-3333-4333-8333-333333333333";

function fakeClient(mergedInto: string | null) {
  return {
    query: async (sql: string, values: unknown[] = []) => {
      if (/FROM mdata\.drivers WHERE operating_company_id/.test(sql)) {
        const id = String(values[1]);
        return { rows: [{ id, first_name: id === S ? "Genaro" : "GENARO", last_name: "Guerrero", status: "Active", merged_into: id === M ? mergedInto : null, cdl_number: null }] };
      }
      if (/count\(\*\)::int AS n/.test(sql)) return { rows: [{ n: 0 }] };
      if (/FROM pg_constraint/.test(sql)) return { rows: [] };
      return { rows: [] };
    },
  };
}

describe("previewDriverMerge resume (443.45)", () => {
  it("an already-merged profile is blocked without resume", async () => {
    const pv = await previewDriverMerge(fakeClient(S) as never, { companyId: "co", survivorId: S, mergedId: M });
    expect(pv.blockers).toContain("This profile is already merged.");
  });
  it("resume finishes the merge into the SAME survivor", async () => {
    const pv = await previewDriverMerge(fakeClient(S) as never, { companyId: "co", survivorId: S, mergedId: M, resume: true });
    expect(pv.blockers).not.toContain("This profile is already merged.");
  });
  it("resume never re-targets a profile merged into a different driver", async () => {
    const pv = await previewDriverMerge(fakeClient(X) as never, { companyId: "co", survivorId: S, mergedId: M, resume: true });
    expect(pv.blockers).toContain("This profile is already merged.");
  });
});
