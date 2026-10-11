import { describe, expect, it } from "vitest";
import { pickSamsaraMatch, type SamsaraCandidate } from "./samsara-stop-match.js";
import { looksLikeStreet } from "./stops-geocode-backfill.service.js";
import { parseFormattedAddress } from "../integrations/samsara/geofences/address-import.service.js";

// ROUND 443.38: a stop resolves to the owner's Samsara address by facility name (same state / near), else to the ONE
// address close by in the same city; ambiguity is never guessed.

const addr = (over: Partial<SamsaraCandidate>): SamsaraCandidate => ({
  samsara_address_id: "1", name: "GDC Logistics", formatted_address: "514 Nafta Blvd, Laredo, TX 78045, USA",
  lat: 27.61, lng: -99.48, geofence_json: null, raw_json: null, distance_m: 5_000, ...over,
});

describe("parseFormattedAddress / looksLikeStreet", () => {
  it("splits a Samsara formatted address", () => {
    expect(parseFormattedAddress("514 Nafta Blvd, Laredo, TX 78045, USA")).toEqual({ street: "514 Nafta Blvd", city: "Laredo", state: "TX", zip: "78045" });
  });
  it("keeps an unparseable address whole as the street", () => {
    expect(parseFormattedAddress("Mile marker 12")).toEqual({ street: "Mile marker 12", city: null, state: null, zip: null });
  });
  it("a house number is a street; a facility name is not", () => {
    expect(looksLikeStreet("514 Nafta Blvd")).toBe(true);
    expect(looksLikeStreet("Aldi Salisbury")).toBe(false);
    expect(looksLikeStreet(null)).toBe(false);
  });
});

describe("pickSamsaraMatch (443.38)", () => {
  const stop = { facility_name: "GDC Logistics", city: "Laredo", state: "TX" };
  it("matches by facility name in the same state", () => {
    expect(pickSamsaraMatch(stop, [addr({})])).toMatchObject({ how: "name", address: { samsara_address_id: "1" } });
  });
  it("a same-name site in another state far away is not this stop", () => {
    expect(pickSamsaraMatch(stop, [addr({ formatted_address: "1 Main St, Edison, NJ 08817, USA", distance_m: 2_500_000 })])).toBeNull();
  });
  it("two same-name sites equally near: ambiguous, no guess", () => {
    expect(pickSamsaraMatch(stop, [addr({ samsara_address_id: "1", distance_m: 3_000 }), addr({ samsara_address_id: "2", formatted_address: "77 Mines Rd, Laredo, TX 78045, USA", distance_m: 4_000 })])).toBeNull();
  });
  it("two same-name sites, one clearly nearest: the nearest", () => {
    expect(pickSamsaraMatch(stop, [addr({ samsara_address_id: "1", distance_m: 1_000 }), addr({ samsara_address_id: "2", distance_m: 30_000 })])?.address.samsara_address_id).toBe("1");
  });
  it("duplicate Samsara rows for one address are one place, not ambiguity (lowest id kept)", () => {
    const s = { facility_name: "Clemens", city: "Coldwater", state: "MI" };
    const dup = (id: string) => addr({ samsara_address_id: id, name: "Clemens Coldwater Plan", formatted_address: "572 Newton Rd, Coldwater, MI 49036, USA", lat: 41.9744, lng: -84.9667, distance_m: 100 });
    expect(pickSamsaraMatch(s, [dup("300"), dup("100"), dup("200")])).toMatchObject({ how: "name", address: { samsara_address_id: "100" } });
  });
  it("same name at two different addresses stays ambiguous", () => {
    const s = { facility_name: "Clemens", city: "Coldwater", state: "MI" };
    const a = addr({ samsara_address_id: "1", name: "Clemens Coldwater Plan", formatted_address: "572 Newton Rd, Coldwater, MI 49036, USA", distance_m: 100 });
    const b = addr({ samsara_address_id: "2", name: "Clemens Coldwater Plan", formatted_address: "9 Other Rd, Coldwater, MI 49036, USA", distance_m: 150 });
    expect(pickSamsaraMatch(s, [a, b])).toBeNull();
  });
  it("no name: the ONE address within 1 km in the same city", () => {
    const s = { facility_name: null, city: "Laredo", state: "TX" };
    expect(pickSamsaraMatch(s, [addr({ distance_m: 600 })])).toMatchObject({ how: "proximity" });
    expect(pickSamsaraMatch(s, [addr({ distance_m: 600 }), addr({ samsara_address_id: "2", formatted_address: "77 Mines Rd, Laredo, TX 78045, USA", distance_m: 900 })])).toBeNull();
    expect(pickSamsaraMatch(s, [addr({ distance_m: 1_600 })])).toBeNull();
  });
});

import { pickPlaceForFacility } from "./stops-geocode-backfill.service.js";

describe("pickPlaceForFacility (443.43 iii)", () => {
  const place = (over: Record<string, unknown>) => ({ formatted: "", address_line1: "572 Newton Rd", city: "Coldwater", state: "MI", country: "US", zip: "49036", lat: 41.97, lon: -84.96, name: "Clemens Food Group", ...over });
  const stop = { city: "Coldwater", state: "MI" };
  it("accepts a place whose name matches the facility and whose city / state match", () => {
    expect(pickPlaceForFacility("Clemens", stop, [place({})])).toMatchObject({ result: { address_line1: "572 Newton Rd" }, confidence: 0.75 });
  });
  it("refuses a name mismatch, a city mismatch, or a result with no street", () => {
    expect(pickPlaceForFacility("Clemens", stop, [place({ name: "Walmart Supercenter" })])).toBeNull();
    expect(pickPlaceForFacility("Clemens", stop, [place({ city: "Hatfield" })])).toBeNull();
    expect(pickPlaceForFacility("Clemens", stop, [place({ address_line1: "" })])).toBeNull();
  });
  it("two different matching addresses = ambiguous = none", () => {
    expect(pickPlaceForFacility("Clemens", stop, [place({}), place({ address_line1: "9 Other Rd" })])).toBeNull();
  });
});
