// LEAD 443.202 — prod dry run 10-21 20:40Z: 28 of 92 WEX lines listed amount_mismatch. The settlements booked each WEX
// receipt at what the card CHARGED (Amt); the 5%-from-retail rule measured that receipt against pump retail, and the WEX
// discount runs 6-13% of retail. WEX 87359 (T171 10-11 ULSD): receipt 565.70 = Amt, retail 602.18 -> "differs by -3648".
import { describe, expect, it } from "vitest";
import { dreamlineAdoptionRefused } from "../dreamline-statement-import.service.js";

const wex87359 = { gross_cents: 60218, net_cents: 56570 };

describe("dreamlineAdoptionRefused — a receipt at the card charge is the charge (443.202)", () => {
  it("adopts a receipt booked at exactly what the card charged, whatever the discount", () => {
    expect(dreamlineAdoptionRefused(56570, wex87359)).toBe(false);
    expect(dreamlineAdoptionRefused(56571, wex87359)).toBe(false);
    expect(dreamlineAdoptionRefused(114856, { gross_cents: 130169, net_cents: 114856 })).toBe(false); // 84725, 11.8% off
  });
  it("still adopts a receipt at pump retail (Dreamline shape)", () => {
    expect(dreamlineAdoptionRefused(60218, wex87359)).toBe(false);
  });
  it("still refuses a receipt neither at the charge nor within 5% of retail (mistyped receipt)", () => {
    expect(dreamlineAdoptionRefused(70000, wex87359)).toBe(true);
  });
  it("still refuses a receipt below the card charge", () => {
    expect(dreamlineAdoptionRefused(56000, wex87359)).toBe(true);
  });
});
