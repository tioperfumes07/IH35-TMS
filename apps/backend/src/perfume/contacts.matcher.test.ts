import { describe, expect, it } from "vitest";
import { ContactMatcher, phone10 } from "./contacts.matcher.js";

const row = (id: string, o: Partial<{ external_source: string; external_directory_id: string; google_place_id: string; phone: string; domain: string; name_key: string; city_l: string; archived: boolean }> = {}) => ({
  id, external_source: null, external_directory_id: null, google_place_id: null, phone: null, domain: null, name_key: null, city_l: null, archived: false, ...o,
});

describe("contact matcher — the same keys and order as the SQL it replaces", () => {
  const m = new ContactMatcher();
  m.addCompanyRow(row("a", { domain: "pc.com", phone: "+1 (516) 555-0101", name_key: "la rosa", city_l: "nuevo laredo" }));
  m.addCompanyRow(row("b", { external_source: "INEGI DENUE", external_directory_id: "d-1", phone: "867 000 0001" }));
  m.addCompanyRow(row("c", { archived: true, domain: "old.com", phone: "8670000009" }));
  m.addCompanyRow(row("g", { google_place_id: "ChIJ-1" }));
  m.addPerson("a", "Ronak@PC.com", ["9565550102"]);

  it("finds by outside key, place, email, phone (company then person), domain, name + city — in that order (email before phone: owner 2026-11-28)", () => {
    expect(m.find({ externalSource: "INEGI DENUE", externalId: "d-1", phones: [], emails: [] })).toEqual(["b", "outside key"]);
    expect(m.find({ placeId: "ChIJ-1", phones: ["5165550101"], emails: [] })).toEqual(["g", "place_id"]);
    expect(m.find({ phones: [phone10("(516) 555-0101")!], emails: ["ronak@pc.com"] })).toEqual(["a", "email"]);
    expect(m.find({ phones: ["8670000001"], emails: ["ronak@pc.com"] })).toEqual(["a", "email"]); // a shared phone never beats the email
    expect(m.find({ phones: ["9565550102"], emails: [] })).toEqual(["a", "phone"]);
    expect(m.find({ phones: [], emails: ["RONAK@pc.com"] })).toEqual(["a", "email"]);
    expect(m.find({ phones: [], emails: [], domain: "pc.com" })).toEqual(["a", "domain"]);
    expect(m.find({ phones: [], emails: [], nameKey: "la rosa", city: "Nuevo Laredo" })).toEqual(["a", "name + city"]);
  });

  it("never matches an archived company by phone or domain, nor a free-mail domain", () => {
    expect(m.find({ phones: ["8670000009"], emails: [], domain: "old.com" })).toEqual([null, null]);
    expect(m.find({ phones: [], emails: [], domain: "gmail.com" }, { freeMail: new Set(["gmail.com"]) })).toEqual([null, null]);
  });

  it("two ids from the same directory never merge; another source still does", () => {
    expect(m.find({ externalSource: "INEGI DENUE", externalId: "d-2", phones: ["8670000001"], emails: [] }, { notSameDirectory: "INEGI DENUE" })).toEqual([null, null]);
    expect(m.find({ phones: ["8670000001"], emails: [] })).toEqual(["b", "phone"]);
  });

  it("uses the last 10 digits, 10 or more digits only", () => {
    expect(phone10("+52 1 867 123 4567")).toBe("8671234567");
    expect(phone10("555-0101")).toBeNull();
  });
});
