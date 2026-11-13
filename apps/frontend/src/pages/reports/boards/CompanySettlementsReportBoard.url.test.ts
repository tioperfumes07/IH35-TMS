import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("ROUND 8.20 board29 — Company settlements report URL SoT", () => {
  const source = readFileSync(resolve(__dirname, "./CompanySettlementsReportBoard.tsx"), "utf8");

  it("hydrates group/drill/zero_cost from searchParams", () => {
    expect(source).toMatch(/useSearchParams/);
    expect(source).toMatch(/searchParams\.get\("group"\)/);
    expect(source).toMatch(/searchParams\.get\("drill"\)/);
    expect(source).toMatch(/zero_cost/);
    expect(source).toMatch(/openZeroCostList/);
  });
});
