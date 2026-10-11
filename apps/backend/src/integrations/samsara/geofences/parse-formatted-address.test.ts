import { describe, expect, it } from "vitest";
import { parseFormattedAddress } from "./address-import.service.js";

describe("parseFormattedAddress (443.60)", () => {
  it("keeps a plain street", () => {
    expect(parseFormattedAddress("514 Nafta Blvd, Laredo, TX 78045, USA")).toEqual({ street: "514 Nafta Blvd", city: "Laredo", state: "TX", zip: "78045" });
  });
  it("drops the facility label the TMS pushed in front of the street", () => {
    expect(parseFormattedAddress("Manfredi — 290 Chambers Road, Toughkenamon, PA 19374").street).toBe("290 Chambers Road");
    expect(parseFormattedAddress("Calavo Growers Inc — 100 Dartmouth Drive, SWEDESBORO, NJ 08085").street).toBe("100 Dartmouth Drive");
  });
  it("leaves a dash that is not a facility prefix alone", () => {
    expect(parseFormattedAddress("Suite A - Building 2, Laredo, TX 78045").street).toBe("Suite A - Building 2");
  });
});
