import { describe, expect, it } from "vitest";
import { companyCodeFromFaroCompany, resolveInboundLoadEntity } from "../inbound-load-entity.js";

describe("ROUND 326 inbound load entity resolution", () => {
  it("reads the owner's Faro Company column (IH = IH 35 TRANSPORTATION)", () => {
    expect(companyCodeFromFaroCompany("IH")).toBe("TRANSP");
    expect(companyCodeFromFaroCompany("IH 35 Transportation, LLC")).toBe("TRANSP");
    expect(companyCodeFromFaroCompany("USMCA")).toBe("USMCA");
    expect(companyCodeFromFaroCompany("")).toBeNull();
    expect(companyCodeFromFaroCompany("Acme")).toBeNull();
  });
  it("a normal booking (not an import) is untouched", () => {
    expect(resolveInboundLoadEntity({ targetCompanyCode: "USMCA", isImport: false })).toEqual({ ok: true, source_entity_code: null });
  });
  it("an import that names no company is rejected — never a default", () => {
    const d = resolveInboundLoadEntity({ targetCompanyCode: "USMCA", isImport: true, source: { system: "alwaystrack" } });
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.error).toBe("inbound_load_entity_unresolved");
  });
  it("a TRANSPORTATION load cannot be booked under USMCA (the 2026-09-24 import)", () => {
    const d = resolveInboundLoadEntity({ targetCompanyCode: "USMCA", isImport: true, source: { system: "faro", company_code: "TRANSP" } });
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.error).toBe("inbound_load_entity_mismatch");
  });
  it("a matching source books and stamps the source entity", () => {
    expect(resolveInboundLoadEntity({ targetCompanyCode: "USMCA", isImport: true, source: { system: "faro", company_code: "USMCA" } })).toEqual({ ok: true, source_entity_code: "USMCA" });
  });
});
