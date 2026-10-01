import { describe, it, expect } from "vitest";
import { countryOfFix, crossingPointForFence, directionOf, isInternationalCrossing } from "../detector.service.js";

describe("border crossings projected from canonical fence events (E-29)", () => {
  it("only international crossings count; state truck ports do not", () => {
    expect(isInternationalCrossing("World Trade Bridge POE - World Trade Bridge (Texas)")).toBe(true);
    expect(isInternationalCrossing("Houlton Port of Entry - I-95 Northbound (Maine)")).toBe(true);
    expect(isInternationalCrossing("Beckham County Port of Entry - I-40 Eastbound (Oklahoma)")).toBe(false);
  });

  it("maps the Laredo bridges to their real crossing points", () => {
    expect(crossingPointForFence("Gateway to the Americas International Bridge (Laredo I) — Laredo, TX / Nuevo Laredo, TAM")).toBe("laredo-i");
    expect(crossingPointForFence("Juárez–Lincoln International Bridge (Laredo II) — Laredo, TX / Nuevo Laredo, TAM")).toBe("laredo-ii");
    expect(crossingPointForFence("Laredo Columbia POE - Columbia Bridge (Texas)")).toBe("colombia");
    expect(crossingPointForFence("World Trade Bridge POE - World Trade Bridge (Texas)")).toBe("laredo-iv");
    expect(crossingPointForFence("Pharr POE Inspection Station - Pharr Bridge (Texas)")).toBe("other");
  });

  it("country of a fix: US state code, Mexican state in the address, else unknown (St. Tammany is not Tamaulipas)", () => {
    expect(countryOfFix("TX", "I-35, Laredo, TX, 78045")).toBe("US");
    expect(countryOfFix(null, "Carretera Nuevo Laredo-Piedras Negras, Municipio de Nuevo Laredo, TAM")).toBe("MX");
    expect(countryOfFix("LA", "West Florida Republic Parkway, St. Tammany Parish, LA")).toBe("US");
    expect(countryOfFix(null, null)).toBeNull();
  });

  it("direction only when the country actually changes", () => {
    expect(directionOf("MX", "US")).toBe("northbound");
    expect(directionOf("US", "MX")).toBe("southbound");
    expect(directionOf("CA", "US")).toBe("southbound");
    expect(directionOf("US", "US")).toBeNull();
    expect(directionOf(null, "US")).toBeNull();
  });
});
