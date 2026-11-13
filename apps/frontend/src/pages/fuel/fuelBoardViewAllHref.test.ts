import { describe, expect, it } from "vitest";
import { fuelBoardViewAllHref } from "./fuelBoardViewAllHref";

describe("ROUND 8.20 board19 fuelBoardViewAllHref", () => {
  it("carries period=sep and ret=/fuel when leaving Home", () => {
    const href = fuelBoardViewAllHref("sep", "/fuel");
    expect(href).toContain("/fuel/by-truck");
    expect(href).toContain("period=sep");
    expect(href).toContain("ret=");
    expect(decodeURIComponent(href)).toContain("/fuel");
  });

  it("omits default oct period param but still attaches ret", () => {
    const href = fuelBoardViewAllHref("oct", "/fuel?period=sep");
    expect(href.startsWith("/fuel/by-truck?")).toBe(true);
    expect(href).not.toContain("period=oct");
    expect(href).toContain("ret=");
  });
});
