import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "FuelPlannerHome.tsx"), "utf8");

/** ROUND 8.20 board19 — Fuel.dc.html Home/By-truck must not mount Related strip above the board. */
describe("ROUND 8.20 board19 Fuel Related strip board-only", () => {
  it("gates RelatedModuleLinks off home and by_truck", () => {
    expect(src).toMatch(/tab !== "home" && tab !== "by_truck"/);
    expect(src).toMatch(/RelatedModuleLinks testId="fuel-related-module-links"/);
  });
});
