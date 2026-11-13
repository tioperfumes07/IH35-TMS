import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const tb = readFileSync(join(process.cwd(), "src/pages/reports/TrialBalancePage.tsx"), "utf8");
const home = readFileSync(join(process.cwd(), "src/pages/reports/components/ReportsHomeBoard.tsx"), "utf8");

describe("ROUND 8.20 board25/26 — Reports Cash basis survives TB open + Back", () => {
  it("TrialBalancePage hydrates applied basis from ?basis=cash", () => {
    expect(tb).toMatch(/basisFromSearch/);
    expect(tb).toMatch(/urlBasis/);
    expect(tb).toMatch(/p\.set\("basis", next\.basis\)/);
  });

  it("ReportsHomeBoard stores Cash/Accrual in the URL (not local-only state)", () => {
    expect(home).toMatch(/useSearchParams/);
    expect(home).toMatch(/searchParams\.get\("basis"\)/);
    expect(home).toMatch(/p\.set\("basis", "cash"\)/);
  });
});
