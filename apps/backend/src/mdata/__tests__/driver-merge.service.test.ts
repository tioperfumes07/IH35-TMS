import { describe, expect, it } from "vitest";
import { cdlNearMatch, nameTokensOverlap, normalizeName } from "../driver-merge.service.js";

// Driver merge engine — duplicate detection rules (owner 2026-10-06: one driver profile per person).
describe("duplicate driver detection", () => {
  it("names match regardless of case, accents and word order", () => {
    expect(normalizeName("NEFTALI URBANO", "CORONADO")).toBe(normalizeName("Neftali Coronado", "Urbano"));
    expect(normalizeName("Juan Jorge Castor", "Castañeda")).toBe(normalizeName("JUAN JORGE CASTOR", "CASTANEDA"));
  });
  it("a CDL one character apart (or two digits swapped) is the same licence typed twice", () => {
    expect(cdlNearMatch("GTO0021200", "GTO0021201")).toBe(true);
    expect(cdlNearMatch("DF00145373", "DF00145337")).toBe(true);
    expect(cdlNearMatch("TAMP310697", "TAMP310637")).toBe(true);
    expect(cdlNearMatch("ABC123456", "XYZ987654")).toBe(false);
    expect(cdlNearMatch(null, "GTO0021200")).toBe(false);
  });
  it("a short name contained in the full name overlaps (LUIS CORONA / Jorge Luis Infante Corona)", () => {
    expect(nameTokensOverlap(normalizeName("LUIS", "CORONA"), normalizeName("Jorge Luis Infante", "Corona"))).toBe(true);
    expect(nameTokensOverlap(normalizeName("Ana", "Lopez"), normalizeName("Jorge", "Martinez"))).toBe(false);
  });
});
