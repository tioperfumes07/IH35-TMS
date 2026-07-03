import { describe, expect, it, vi } from "vitest";
import { resolveMissingRequired } from "./missing-required.service.js";

const OPCO = "11111111-1111-4111-8111-111111111111";
const DRIVER = "22222222-2222-4222-8222-222222222222";
const CUST = "33333333-3333-4333-8333-333333333333";

function client(catalog: unknown[], presence: Record<string, boolean>) {
  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes("FROM compliance.required_document_types")) return { rows: catalog };
      // any of the PRESENCE_SQL blocks
      return { rows: [presence] };
    }),
  } as never;
}

describe("resolveMissingRequired (DOC-REQ-2b)", () => {
  it("marks a required code satisfied when present, missing when absent; worst=hard_block wins", async () => {
    const catalog = [
      { code: "cdl", label: "CDL", enforcement: "hard_block", authority: "FMCSA §383" },
      { code: "med_cert", label: "Med Cert", enforcement: "warn", authority: "FMCSA §391.41" },
      { code: "mvr", label: "MVR", enforcement: "warn", authority: null },
    ];
    const res = await resolveMissingRequired(client(catalog, { cdl: true, med_cert: false, mvr: false }), OPCO, "driver", DRIVER);
    const byCode = Object.fromEntries(res.required.map((r) => [r.code, r]));
    expect(byCode.cdl.satisfied).toBe(true);
    expect(byCode.med_cert.satisfied).toBe(false);
    expect(res.missing_count).toBe(2); // med_cert + mvr missing
    expect(res.worst_enforcement).toBe("warn"); // cdl (hard_block) is satisfied, so worst among MISSING = warn
  });

  it("hard_block among the MISSING sets worst=hard_block", async () => {
    const catalog = [{ code: "cdl", label: "CDL", enforcement: "hard_block", authority: null }];
    const res = await resolveMissingRequired(client(catalog, { cdl: false }), OPCO, "driver", DRIVER);
    expect(res.worst_enforcement).toBe("hard_block");
    expect(res.missing_count).toBe(1);
  });

  it("all satisfied → worst=none, missing_count=0", async () => {
    const catalog = [{ code: "cdl", label: "CDL", enforcement: "hard_block", authority: null }];
    const res = await resolveMissingRequired(client(catalog, { cdl: true }), OPCO, "driver", DRIVER);
    expect(res.worst_enforcement).toBe("none");
    expect(res.missing_count).toBe(0);
  });

  it("legal_doc-ambiguous customer codes (msa/noa/credit_app) are NEVER auto-green (needs_manual)", async () => {
    const catalog = [
      { code: "w9", label: "W-9", enforcement: "warn", authority: "IRS" },
      { code: "msa", label: "MSA", enforcement: "warn", authority: null },
      { code: "noa", label: "NOA", enforcement: "warn", authority: null },
      { code: "credit_app", label: "Credit App", enforcement: "warn", authority: null },
    ];
    // even if a stray legal_doc/flag were present, these must not false-green:
    const res = await resolveMissingRequired(client(catalog, { w9: true, msa: true, noa: true, credit_app: true }), OPCO, "customer", CUST);
    const byCode = Object.fromEntries(res.required.map((r) => [r.code, r]));
    expect(byCode.w9.satisfied).toBe(true); // w9 has a dedicated tax_form category
    expect(byCode.msa.needs_manual).toBe(true);
    expect(byCode.msa.satisfied).toBe(false);
    expect(byCode.noa.satisfied).toBe(false);
    expect(byCode.credit_app.satisfied).toBe(false);
  });
});
