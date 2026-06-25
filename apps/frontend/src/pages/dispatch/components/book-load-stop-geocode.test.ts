import { describe, expect, it } from "vitest";
import { stopGeocodePatches } from "./book-load-stop-geocode";
import type { GeocodeResult } from "../../../api/geocoding";

const match: GeocodeResult = {
  formatted: "8900 San Dario Ave, Laredo, TX 78045",
  address_line1: "8900 San Dario Ave",
  city: "Laredo",
  state: "TX",
  country: "US",
  zip: "78045",
  lat: 27.5,
  lon: -99.5,
};

describe("stopGeocodePatches — W8 zip autofill", () => {
  it("maps the geocode zip onto the stop postal_code field (the missing autofill)", () => {
    const patches = stopGeocodePatches(2, match);
    const byField = Object.fromEntries(patches.map((p) => [p.field, p.value]));
    expect(byField["stops.2.postal_code"]).toBe("78045");
    expect(byField["stops.2.city"]).toBe("Laredo");
    expect(byField["stops.2.state"]).toBe("TX");
    expect(byField["stops.2.address_line1"]).toBe("8900 San Dario Ave");
    expect(byField["stops.2.country"]).toBe("US");
  });

  it("indexes the patches to the given stop", () => {
    expect(stopGeocodePatches(0, match).every((p) => p.field.startsWith("stops.0."))).toBe(true);
  });

  it("omits empty fields (never clears a typed value)", () => {
    const partial: GeocodeResult = { formatted: "Laredo, TX", address_line1: "", city: "Laredo", state: "TX", country: "", zip: "", lat: 0, lon: 0 };
    const fields = stopGeocodePatches(1, partial).map((p) => p.field);
    expect(fields).toContain("stops.1.city");
    expect(fields).toContain("stops.1.state");
    expect(fields).not.toContain("stops.1.postal_code"); // empty zip not emitted
    expect(fields).not.toContain("stops.1.address_line1");
  });
});
