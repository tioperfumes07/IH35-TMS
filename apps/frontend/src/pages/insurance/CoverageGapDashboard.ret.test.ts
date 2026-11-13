import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "./CoverageGapDashboard.tsx"), "utf8");

describe("ROUND 8.20 board20 — Coverage gaps Back honors ?ret=", () => {
  it("resolves Back from ret (does not hard-code /insurance alone)", () => {
    expect(source).toMatch(/resolveBackHref/);
    expect(source).toMatch(/coverageGapBackHref/);
    expect(source).toMatch(/backHref=\{coverageGapBackHref\}/);
    // Negative: no remaining hard-coded PageHeader backHref="/insurance"
    expect(source).not.toMatch(/backHref="\/insurance"/);
  });
});
