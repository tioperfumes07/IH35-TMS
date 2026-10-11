import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 443.62 #5: "Laredo, TX" returned [] — the city row has no street and no zip.
const LOCALITY = {
  address_components: [
    { long_name: "Laredo", short_name: "Laredo", types: ["locality", "political"] },
    { long_name: "Texas", short_name: "TX", types: ["administrative_area_level_1", "political"] },
    { long_name: "United States", short_name: "US", types: ["country", "political"] },
  ],
  formatted_address: "Laredo, TX, USA",
  geometry: { location: { lat: 27.5306, lng: -99.4803 } },
  place_id: "laredo",
};

describe("searchAddress typed city (443.62 #5)", () => {
  beforeEach(() => {
    process.env.GOOGLE_PLACES_ENABLED = "true";
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("places:searchText")) return new Response(JSON.stringify({ places: [] }), { status: 200 });
      return new Response(JSON.stringify({ status: "OK", results: [LOCALITY] }), { status: 200 });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("returns the city row when nothing street- or zip-level exists", async () => {
    const { searchAddress } = await import("../google-places-client.js");
    const r = await searchAddress("Laredo, TX", 5);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ city: "Laredo", state: "TX", lat: 27.5306, lon: -99.4803 });
  });

  it("a street geocode never takes the city row as its point", async () => {
    const { geocodeAddressWithEvidence } = await import("../../../telematics/stop-geocode-fallback.service.js");
    const r = await geocodeAddressWithEvidence({ address_line1: "999 Nowhere Rd", city: "Laredo", state: "TX", postal_code: null, country: "US" } as never);
    expect(r).toEqual({ ok: false, reason: "no_result" });
  });
});
