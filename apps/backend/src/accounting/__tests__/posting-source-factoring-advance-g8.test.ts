/**
 * LEAD 443.185 G8 — fail-old: on main a factoring_advance posting carried NO party and NO load (prod: 155 of 155 lines,
 * 25 advances). The advance was missing from the factoring load branch and was classed party-less, although every leg
 * of an advance is with the factor (1090 / 6400 / 1230 / 2150 / 6300 — no A/R leg).
 */
import { describe, expect, it } from "vitest";
import { postingPartyClass, resolvePostingSourceEntity, resolvePostingSourceLoad } from "../posting-line-writer.js";

const CO = "00000000-0000-4000-8000-000000000001";
const ADV = "77777777-7777-4777-8777-777777777777";

function client(opts: { load?: string | null; factor?: string | null }) {
  const seen: string[] = [];
  return {
    seen,
    query: async (sql: string) => {
      seen.push(sql);
      if (/FROM accounting\.factoring_advances a/.test(sql)) return { rows: [{ load_id: opts.load ?? null }] };
      if (/factoring_company_vendor_id::text AS e/.test(sql)) return { rows: opts.factor ? [{ e: opts.factor, t: "vendor" }] : [] };
      throw new Error(`unhandled: ${sql}`);
    },
  };
}

const line = { operating_company_id: CO, source_transaction_type: "factoring_advance", source_transaction_id: ADV, reversal_of_line_id: null } as never;

describe("factoring advance postings carry the factor + the advance's one load (443.185 G8)", () => {
  it("every leg names the factoring company vendor", async () => {
    expect(await resolvePostingSourceEntity(client({ factor: "vendor-faro" }) as never, line)).toEqual({ entity_uuid: "vendor-faro", entity_type: "vendor" });
    expect(postingPartyClass("factoring_advance")).toBe("from_document");
  });

  it("carries the advance's load: source_load_id, else the ONE load its live invoices name", async () => {
    const c = client({ load: "load-13571" });
    expect(await resolvePostingSourceLoad(c as never, line)).toBe("load-13571");
    expect(c.seen[0]).toMatch(/HAVING count\(DISTINCT i\.source_load_id\) = 1/);
    expect(c.seen[0]).toMatch(/i\.voided_at IS NULL/);
  });

  it("an advance whose invoices span several loads carries no load (never a guess)", async () => {
    expect(await resolvePostingSourceLoad(client({ load: null }) as never, line)).toBeNull();
  });
});
