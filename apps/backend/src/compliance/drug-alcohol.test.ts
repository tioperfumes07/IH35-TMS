import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fisherYatesShuffle, pickRandomSelections, selectionCounts } from "./drug-alcohol-pool.js";
import { computeAnnualRateStatus } from "./drug-alcohol-results.js";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("drug-alcohol-pool", () => {
  it("selects quarterly percentages from pool", () => {
    const members = Array.from({ length: 40 }, (_, i) => `driver-${i}`);
    const selections = pickRandomSelections(members, 2, 2026, "seed");
    const { drugCount, alcoholCount } = selectionCounts(40);
    expect(selections.filter((s) => s.test_type === "drug").length).toBe(drugCount);
    expect(selections.filter((s) => s.test_type === "alcohol").length).toBe(alcoholCount);
    const uniqueDrug = new Set(selections.filter((s) => s.test_type === "drug").map((s) => s.driver_id));
    expect(uniqueDrug.size).toBe(drugCount);
  });

  it("fisher-yates preserves all items", () => {
    const input = ["a", "b", "c", "d", "e"];
    const shuffled = fisherYatesShuffle(input, (max) => (max > 0 ? 1 : 0));
    expect(shuffled.sort()).toEqual(input.sort());
  });

  it("annual rate status tracks FMCSA minimums", () => {
    const onTrack = computeAnnualRateStatus(2026, 20, 10, 2);
    expect(onTrack.drug_on_track).toBe(true);
    expect(onTrack.alcohol_on_track).toBe(true);
    const behind = computeAnnualRateStatus(2026, 20, 2, 0);
    expect(behind.drug_on_track).toBe(false);
    expect(behind.alcohol_on_track).toBe(false);
  });

  it("wires routes from form-425c bootstrap", () => {
    const form425c = fs.readFileSync(path.join(here, "form-425c.routes.ts"), "utf8");
    expect(form425c).toContain("registerDrugAlcoholComplianceRoutes");
  });
});
