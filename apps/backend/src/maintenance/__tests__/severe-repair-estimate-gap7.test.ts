import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("GAP-7 severe repair fleet restore seam", () => {
  it("service exports fleet restore helpers", () => {
    const src = fs.readFileSync(path.join(here, "../severe-repair-estimate.service.ts"), "utf8");
    expect(src).toContain("getFleetRestoreCost");
    expect(src).toContain("getPerUnitBreakdown");
    expect(src).toContain("total_remaining_cents");
  });

  it("routes register fleet restore + owner-only pdf export", () => {
    const src = fs.readFileSync(path.join(here, "../severe-repair-estimate.routes.ts"), "utf8");
    expect(src).toContain("/api/v1/maintenance/severe-repair/fleet-restore-cost");
    expect(src).toContain("/api/v1/maintenance/severe-repair/per-unit-breakdown");
    expect(src).toContain("/api/v1/maintenance/severe-repair/export-pdf");
    expect(src).toContain("forbidden_owner_only");
  });

  it("pdf export renderer exists", () => {
    const src = fs.readFileSync(path.join(here, "../severe-repair-pdf-export.ts"), "utf8");
    expect(src).toContain("renderSevereRepairInsurancePdf");
  });
});
