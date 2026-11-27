/**
 * Owner 2026-11-27 15:40 CT: "in list analysis i should be able to select if vendor, or competition, such as esperanza, sonia, omni,
 * broadway, etc. … i need to be able to select multiple competitors". The comparator is the cheapest REAL price among the picked:
 * a competitor's real = list − cushion (s:*), a supplier's real = list − its cushion (v:*:net).
 */
import { describe, expect, it } from "vitest";
import { compBestOf, type GridRow } from "./desk.service.js";

const row: GridRow = {
  id: "i1",
  "s:esp:price": 2500, "s:esp:cushion": 50, "s:esp:real": 2450, "s:esp:desc": "ESP LINE",
  "s:bro:price": 2400, "s:bro:cushion": 50, "s:bro:real": 2350, "s:bro:desc": "BRO LINE",
  "v:pca:price": 2300, "v:pca:cush": 25, "v:pca:net": 2275,
};
const label = (id: string) => ({ esp: "ESPERANZA", bro: "BROADWAY", pca: "Perfume Center of America" })[id] ?? id;

describe("compare with competitors and / or vendors", () => {
  it("several competitors: the cheapest real price wins", () => {
    expect(compBestOf(row, new Set(["esp", "bro"]), label)).toEqual({ list: 2400, cushion: 50, real: 2350, desc: "BRO LINE", vendor: "BROADWAY" });
    expect(compBestOf(row, new Set(["esp"]), label)?.real).toBe(2450);
  });
  it("a vendor picked: its list price less its cushion; mixed with competitors the cheapest still wins", () => {
    expect(compBestOf(row, new Set(["pca"]), label)).toEqual({ list: 2300, cushion: 25, real: 2275, desc: null, vendor: "Perfume Center of America" });
    expect(compBestOf(row, new Set(["esp", "pca"]), label)?.vendor).toBe("Perfume Center of America");
    expect(compBestOf(row, new Set(["nobody"]), label)).toBeNull();
  });
});
