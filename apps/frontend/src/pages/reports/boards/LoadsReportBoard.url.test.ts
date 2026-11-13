import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("ROUND 8.20 board27 — Loads report group/drill URL SoT", () => {
  const source = readFileSync(resolve(__dirname, "./LoadsReportBoard.tsx"), "utf8");

  it("hydrates group + drill from searchParams (not local-only state)", () => {
    expect(source).toMatch(/useSearchParams/);
    expect(source).toMatch(/searchParams\.get\("group"\)/);
    expect(source).toMatch(/searchParams\.get\("drill"\)/);
    expect(source).toMatch(/p\.set\("group"/);
    expect(source).toMatch(/p\.set\("drill"/);
  });

  it("revenue-by-week chart bars drill via setDrill (interactive)", () => {
    expect(source).toMatch(/loads-report-week-bar-/);
    expect(source).toMatch(/onClick=\{\(\) => setDrill\(\{ by: "week"/);
  });
});
