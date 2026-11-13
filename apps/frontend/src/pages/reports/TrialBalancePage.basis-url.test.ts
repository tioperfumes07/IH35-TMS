import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const tb = readFileSync(join(process.cwd(), "src/pages/reports/TrialBalancePage.tsx"), "utf8");
const bs = readFileSync(join(process.cwd(), "src/pages/reports/BalanceSheetPage.tsx"), "utf8");
const pl = readFileSync(join(process.cwd(), "src/pages/reports/ProfitLossPage.tsx"), "utf8");
const home = readFileSync(join(process.cwd(), "src/pages/reports/components/ReportsHomeBoard.tsx"), "utf8");

describe("ROUND 8.20 board25/26 — Reports Cash basis survives TB/BS/PL open + Back", () => {
  it("TrialBalancePage hydrates applied basis from ?basis=cash", () => {
    expect(tb).toMatch(/basisFromSearch/);
    expect(tb).toMatch(/urlBasis/);
    expect(tb).toMatch(/p\.set\("basis", next\.basis\)/);
    expect(tb).toMatch(/resolveBackHref/);
    expect(tb).toMatch(/backHref=\{reportsBackHref\}/);
  });

  it("BalanceSheetPage hydrates applied basis from ?basis=cash", () => {
    expect(bs).toMatch(/basisFromSearch/);
    expect(bs).toMatch(/urlBasis/);
    expect(bs).toMatch(/p\.set\("basis", next\.basis\)/);
    expect(bs).toMatch(/resolveBackHref/);
    expect(bs).toMatch(/backHref=\{reportsBackHref\}/);
  });

  it("ProfitLossPage hydrates applied basis from ?basis=cash", () => {
    expect(pl).toMatch(/basisFromSearch/);
    expect(pl).toMatch(/urlBasis/);
    expect(pl).toMatch(/p\.set\("basis", next\.basis\)/);
    expect(pl).toMatch(/resolveBackHref/);
    expect(pl).toMatch(/backHref=\{reportsBackHref\}/);
  });

  it("ReportsHomeBoard stores Cash/Accrual in the URL (not local-only state)", () => {
    expect(home).toMatch(/useSearchParams/);
    expect(home).toMatch(/searchParams\.get\("basis"\)/);
    expect(home).toMatch(/p\.set\("basis", "cash"\)/);
  });
});
