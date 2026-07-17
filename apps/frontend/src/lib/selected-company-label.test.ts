import { describe, expect, it } from "vitest";
import { selectedCompanyLegalBadgeLabel, selectedCompanySwitcherLabel } from "./selected-company-label";
import type { MyCompany } from "../api/org";

const sample: MyCompany = {
  id: "11111111-1111-1111-1111-111111111111",
  legal_name: "IH35 Trucking LLC",
  short_name: "TRK",
  code: "TRK",
  company_type: "operating_carrier",
  is_active: true,
  is_default: true,
};

describe("selectedCompanySwitcherLabel", () => {
  it("prefers short_name over legal_name", () => {
    expect(selectedCompanySwitcherLabel(sample)).toBe("TRK");
  });

  it("falls back to legal_name when short_name is empty", () => {
    expect(selectedCompanySwitcherLabel({ ...sample, short_name: "" })).toBe("IH35 Trucking LLC");
  });
});

describe("selectedCompanyLegalBadgeLabel", () => {
  it("prefers legal_name for the topbar entity badge", () => {
    expect(selectedCompanyLegalBadgeLabel(sample)).toBe("IH35 Trucking LLC");
  });

  it("falls back to short_name when legal_name is empty", () => {
    expect(selectedCompanyLegalBadgeLabel({ ...sample, legal_name: "" })).toBe("TRK");
  });
});
