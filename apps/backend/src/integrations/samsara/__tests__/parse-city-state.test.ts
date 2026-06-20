import { describe, expect, it } from "vitest";
import { parseCityState } from "../samsara-client.js";

// GUARD live: city="OH" (the state code), state=null, while formatted="5415 Centerpoint Parkway, Obetz, OH, 43125".
// The parse must scan from the right for the state token (a trailing ZIP can follow it) and city must NEVER == state.
describe("parseCityState (reverse-geo city/state split bug)", () => {
  it("the Obetz case: state token is NOT the last part (ZIP follows)", () => {
    expect(parseCityState("5415 Centerpoint Parkway, Obetz, OH, 43125")).toEqual({ city: "Obetz", state: "OH" });
  });

  it("state as the last part", () => {
    expect(parseCityState("1200 San Bernardo Ave, Laredo, TX")).toEqual({ city: "Laredo", state: "TX" });
  });

  it("state + ZIP in the same last part", () => {
    expect(parseCityState("1200 San Bernardo Ave, Laredo, TX 78040")).toEqual({ city: "Laredo", state: "TX" });
  });

  it("city is NEVER the state code, across a range of formats", () => {
    for (const f of [
      "5415 Centerpoint Parkway, Obetz, OH, 43125",
      "Some St, George West, TX, 78022",
      "Cotulla, TX",
      "TX, 78040",
    ]) {
      const r = parseCityState(f);
      if (r.city && r.state) expect(r.city.toUpperCase()).not.toBe(r.state);
    }
  });

  it("null / empty -> nulls", () => {
    expect(parseCityState(null)).toEqual({ city: null, state: null });
    expect(parseCityState("")).toEqual({ city: null, state: null });
  });
});
