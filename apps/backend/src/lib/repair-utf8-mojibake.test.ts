import { describe, expect, it } from "vitest";
import { repairUtf8Mojibake } from "./repair-utf8-mojibake.js";

describe("repairUtf8Mojibake", () => {
  it("repairs México stored as MÃ©xico", () => {
    expect(repairUtf8Mojibake("NCC Logistics MÃ©xico")).toBe("NCC Logistics México");
  });

  it("repairs a Latin-1 apostrophe mojibake", () => {
    expect(repairUtf8Mojibake("LovellÂ´s loading service INC")).toBe("Lovell´s loading service INC");
  });

  it("leaves a correct UTF-8 name alone", () => {
    expect(repairUtf8Mojibake("NCC Logistics México")).toBe("NCC Logistics México");
  });
});
