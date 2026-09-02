import { describe, expect, it } from "vitest";
import { parseCityStateInput, resolveStopPlace } from "./book-load-city-state";

describe("parseCityStateInput", () => {
  it("splits Laredo, TX and Laredo TX", () => {
    expect(parseCityStateInput("Laredo, TX")).toEqual({ city: "Laredo", state: "TX" });
    expect(parseCityStateInput("Laredo TX")).toEqual({ city: "Laredo", state: "TX" });
    expect(parseCityStateInput("laredo, tx")).toEqual({ city: "laredo", state: "TX" });
  });

  it("leaves a bare city without inventing a state", () => {
    expect(parseCityStateInput("Laredo")).toEqual({ city: "Laredo", state: "" });
  });
});

describe("resolveStopPlace", () => {
  it("prefers the State picker when set", () => {
    expect(resolveStopPlace("Laredo, TX", "OK")).toEqual({ city: "Laredo", state: "OK" });
  });

  it("uses the city suffix when St is empty so lane lookup can fire", () => {
    expect(resolveStopPlace("Denton TX", "")).toEqual({ city: "Denton", state: "TX" });
  });
});
