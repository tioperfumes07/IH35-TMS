import { describe, expect, it } from "vitest";
import { companyLabel, formatCompanyName } from "./formatCompanyName";
import { userDisplayLabel } from "./entity-label";

describe("formatCompanyName (rows 223 225 229 231 — organisations in proper case, suffixes upper)", () => {
  it.each([
    ["ACME FREIGHT LLC", "Acme Freight LLC"],
    ["Acme Freight Llc", "Acme Freight LLC"],
    ["TRANSPORTES GARZA SA DE CV", "Transportes Garza SA DE CV"],
    ["TRANSPORTES GARZA S.A. DE C.V.", "Transportes Garza S.A. DE C.V."],
    ["DE LA CRUZ TRUCKING INC", "De La Cruz Trucking INC"],
    ["USMCA FREIGHT SOLUTIONS", "USMCA Freight Solutions"],
    ["IH 35 TRANSPORTATION LLC", "IH 35 Transportation LLC"],
    ["FedEx Freight", "FedEx Freight"],
    ["3PL LOGISTICS", "3PL Logistics"],
    ["SMITH-JONES CO", "Smith-Jones Co"],
    ["  big   rig  usa ", "Big Rig USA"],
    ["", ""],
  ])("%s → %s", (input, expected) => {
    expect(formatCompanyName(input)).toBe(expected);
  });

  it("null / undefined → empty string", () => {
    expect(formatCompanyName(null)).toBe("");
    expect(formatCompanyName(undefined)).toBe("");
  });
});

describe("companyLabel (entityLabel fallbacks kept, resolved name proper-cased)", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  it("resolved ALL CAPS customer → proper case", () => {
    expect(companyLabel("ACME FREIGHT LLC", id, "Customer")).toBe("Acme Freight LLC");
  });
  it("missing name keeps the honest sentence", () => {
    expect(companyLabel(null, id, "Customer")).toBe("Customer — not visible");
    expect(companyLabel(null, null, "Vendor")).toBe("Unassigned");
  });
  it("uuid-shaped name is still rejected", () => {
    expect(companyLabel(id, id, "Vendor")).toBe("Vendor — not visible");
  });
});

describe("userDisplayLabel (row 233 — no repeated generic User label)", () => {
  const id = "22222222-2222-4222-8222-222222222222";
  it("HUGO GAYTAN → Hugo Gaytan", () => {
    expect(userDisplayLabel({ id, name: "HUGO GAYTAN", email: "hugo@x.com" })).toBe("Hugo Gaytan");
  });
  it("blank name falls to first+last, then to the email as stored (never proper-cased)", () => {
    expect(userDisplayLabel({ id, name: "", first_name: "MARIA", last_name: "LOPEZ", email: "m@x.com" })).toBe("Maria Lopez");
    expect(userDisplayLabel({ id, name: "", email: "jorge@ih35trucking.net" })).toBe("jorge@ih35trucking.net");
    expect(userDisplayLabel({ id, name: "ops@ih35trucking.net", email: null })).toBe("ops@ih35trucking.net");
  });
  it("only with neither name nor email does it fall back", () => {
    expect(userDisplayLabel({ id, name: "", email: null })).toBe("User — not visible");
  });
});
