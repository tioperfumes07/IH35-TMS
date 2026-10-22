// LEAD 443.214 — fuel follows the truck at the pump. The pure parts of the one resolver.
import { describe, expect, it } from "vitest";
import { parseStationText, pickFillTruck, type GpsCandidate } from "../fill-truck-and-load.service.js";

const c = (unit_id: string, n: string, minutes_off = 2, distance_m: number | null = 90): GpsCandidate => ({ unit_id, unit_number: n, distance_m, minutes_off });

describe("fill-truck-and-load (443.214)", () => {
  it("reads the Love's store and the city out of the settlement / statement station text", () => {
    expect(parseStationText("LOVES #787 TRAVEL STOP MOSHEIM, TN", null)).toEqual({ store_no: "787", city: "MOSHEIM", state: "TN" });
    expect(parseStationText("LOVES #227 TRAVEL STOP WOODSTOCK, AL", null)).toEqual({ store_no: "227", city: "WOODSTOCK", state: "AL" });
    expect(parseStationText("NATALIA", "TX")).toEqual({ store_no: null, city: "NATALIA", state: "TX" });
  });
  it("one GPS truck at the pump wins over the card's unit label (99368 / 78679: the card said T175, GPS said T152)", () => {
    expect(pickFillTruck([c("t152", "T152")], "t175")).toEqual({ unit: c("t152", "T152"), resolution: "gps" });
  });
  it("several trucks at the pump: the card's unit only when it is one of them", () => {
    expect(pickFillTruck([c("t168", "T168", 0), c("t176", "T176", 2)], "t168").resolution).toBe("gps_card_among");
    expect(pickFillTruck([c("t170", "T170"), c("t173", "T173")], "t124")).toEqual({ unit: null, resolution: "held_ambiguous" });
  });
  it("no GPS at the station is HELD, never guessed from the card", () => {
    expect(pickFillTruck([], "t156")).toEqual({ unit: null, resolution: "held_no_gps_at_station" });
  });
});
