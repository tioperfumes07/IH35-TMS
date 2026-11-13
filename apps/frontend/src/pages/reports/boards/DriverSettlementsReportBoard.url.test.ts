import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("ROUND 8.20 board28 — Driver settlements report URL SoT", () => {
  const source = readFileSync(resolve(__dirname, "./DriverSettlementsReportBoard.tsx"), "utf8");

  it("hydrates group/drill/status/paid from searchParams", () => {
    expect(source).toMatch(/useSearchParams/);
    expect(source).toMatch(/searchParams\.get\("group"\)/);
    expect(source).toMatch(/searchParams\.get\("drill"\)/);
    expect(source).toMatch(/searchParams\.get\("status"\)/);
    expect(source).toMatch(/searchParams\.get\("paid"\)/);
    expect(source).toMatch(/applyClosedUnpaidKpi/);
  });
});
