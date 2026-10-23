import { describe, expect, it } from "vitest";
import { formatPersonName } from "./formatPersonName";

describe("formatPersonName (owner: proper case everywhere)", () => {
  it.each([
    ["HUGO GAYTAN", "Hugo Gaytan"],
    ["EDUARDO AZAEL FLORES ORTIZ", "Eduardo Azael Flores Ortiz"],
    ["Vicente Santos contreras", "Vicente Santos Contreras"],
    ["ANTONIO RAMIREZ-MARTINEZ JR.", "Antonio Ramirez-Martinez Jr."],
    ["Concepcion Cordova Dominguez", "Concepcion Cordova Dominguez"],
    ["Juan McAllen", "Juan McAllen"],
    ["  jose   luis  ", "Jose Luis"],
  ])("%s → %s", (input, expected) => {
    expect(formatPersonName(input)).toBe(expected);
  });
});
