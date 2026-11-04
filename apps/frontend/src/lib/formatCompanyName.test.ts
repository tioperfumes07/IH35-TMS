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

describe("formatCompanyName — live FAILs 11-03 rows 223 225 229 (rule 443.266-A: acronyms + legal suffixes kept)", () => {
  it.each([
    // broken mixed-case source word never renders as a lower-then-caps hybrid
    ["Roar loGISTICS INC", "Roar Logistics INC"],
    ["ROAR LOGISTICS INC", "Roar Logistics INC"],
    // short ALL-CAPS tokens from the source stay upper (were "Fls", "2ems", "Im", "Ab", "Es", "Rls", "Pls", "Ind", "Tts", "Glt", "Gtm", "Dls", "Xpr", "Mph", "Cts")
    ["FLS Transport LLC", "FLS Transport LLC"],
    ["2EMS LOGISTICS LLC", "2EMS Logistics LLC"],
    ["2ems Logistics", "2EMS Logistics"],
    ["IM TRUCKING INC", "IM Trucking INC"],
    ["AB Freight Lines", "AB Freight Lines"],
    ["ES TRANSPORT LLC", "ES Transport LLC"],
    ["RLS Logistics", "RLS Logistics"],
    ["PLS LOGISTICS SERVICES", "PLS Logistics Services"],
    ["IND FREIGHT SA DE CV", "IND Freight SA DE CV"],
    ["TTS Transport", "TTS Transport"],
    ["GLT LOGISTICS LLC", "GLT Logistics LLC"],
    ["GTM Freight", "GTM Freight"],
    ["DLS EXPRESS INC", "DLS Express INC"],
    ["XPR LOGISTICS", "XPR Logistics"],
    ["MPH Transport", "MPH Transport"],
    ["CTS LOGISTICS LLC", "CTS Logistics LLC"],
    ["ACME", "ACME"],
    ["ACME Freight", "ACME Freight"],
    // a suffix glued after a comma is still the legal suffix
    ["Ac Trade & Logistics,Llc", "Ac Trade & Logistics, LLC"],
    ["Trident Transport, Llc", "Trident Transport, LLC"],
    ["Refrigerx Transportation Llc", "Refrigerx Transportation LLC"],
    ["Refrigerx Transportation LLC", "Refrigerx Transportation LLC"],
    ["Armstrong Transport Gr", "Armstrong Transport Gr"],
    ["Aak Mexico SA DE CV", "Aak Mexico SA DE CV"],
    ["(4wrdfreight&Logistics Groupinc", "(4wrdfreight&Logistics Groupinc"],
    ["McAllen Freight", "McAllen Freight"],
    ["1st Choice Logistics", "1st Choice Logistics"],
  ])("%s → %s", (input, expected) => {
    expect(formatCompanyName(input)).toBe(expected);
  });

  it("never emits a lower-case letter followed by an upper-case run inside one word", () => {
    for (const s of ["Roar loGISTICS INC", "trANSPORTES gARZA", "xPRESS lINES llc"]) {
      for (const w of formatCompanyName(s).split(" ")) expect(w).not.toMatch(/^[a-z]+[A-Z]{2,}/);
    }
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
    expect(userDisplayLabel({ id, name: "", email: null })).toBe("Invited user (no role)");
  });
  it("row 233 live — never the bare word User: API name \"User\" / email local-part are not names", () => {
    expect(userDisplayLabel({ id, name: "User", email: null, role: "Driver" })).toBe("Invited user (Driver)");
    expect(userDisplayLabel({ id, name: "Invited user (Driver)", email: null, role: "Driver" })).toBe("Invited user (Driver)");
    expect(userDisplayLabel({ id, name: "codex.test.driver0034", email: "codex.test.driver0034@ih35.test", role: "Driver" })).toBe(
      "codex.test.driver0034@ih35.test",
    );
    expect(userDisplayLabel({ id, display_name: "Jorge Munoz", name: "JORGE", email: "j@x.com" })).toBe("Jorge Munoz");
    for (const u of [{ id }, { id, name: "user" }, { id, name: "  ", role: "Owner" }]) expect(userDisplayLabel(u)).not.toBe("User");
  });
});
