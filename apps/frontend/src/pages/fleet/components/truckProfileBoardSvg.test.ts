import { describe, expect, it } from "vitest";
import { truckProfileBoardSvgHtml } from "./truckProfileBoardSvg";

describe("Board 44 truck service map graphic — real unit identity, never the board specimen", () => {
  it("prints the unit, its own make/model/year and trailer, and live callout colours", () => {
    const svg = truckProfileBoardSvgHtml("u-1", { unitNumber: "T152", caption: "FREIGHTLINER CASCADIA 2021 · seen from above, nose right", trailerCaption: "Trailer 5038", callouts: ["ok", "soon", "none", "defect"] });
    expect(svg).toContain(">T152</text>");
    expect(svg).toContain("FREIGHTLINER CASCADIA 2021");
    expect(svg).toContain("Trailer 5038");
    expect(svg).not.toMatch(/T177|PETERBILT|10202/);
    expect(svg).toContain('fill="#1F8A4C"></circle><text x="820"');
    expect(svg).toContain('fill="#C76A0A"></circle><text x="630"');
    expect(svg).toContain('stroke="#C0262D" stroke-width="5"'); // defect highlight only when callout 4 is a defect
  });
  it("draws no numbered pin for a system that does not exist and no defect box when callout 4 is fine", () => {
    const svg = truckProfileBoardSvgHtml("u-2", { unitNumber: "T144", callouts: ["none"] });
    expect(svg).toContain('<text x="820" y="56" fill="#FFFFFF">1</text>');
    expect(svg).not.toContain('<text x="630" y="56"');
    expect(svg).not.toContain('stroke="#C0262D" stroke-width="5"');
    expect(svg).toContain("Make / model not on file");
    expect(svg).toContain("No trailer attached");
  });
  it("escapes markup in unit identity", () => {
    expect(truckProfileBoardSvgHtml("u", { unitNumber: "<b>x" })).toContain("&lt;b&gt;x");
  });
});
