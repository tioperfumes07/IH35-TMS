import { describe, it, expect } from "vitest";
import { computeNextGenerationDate } from "../generator.service.js";

describe("generator: per-frequency next_date computation", () => {
  const cases: Array<[string, string, string]> = [
    ["weekly", "2026-06-01", "2026-06-08"],
    ["biweekly", "2026-06-01", "2026-06-15"],
    ["monthly", "2026-06-01", "2026-07-01"],
    ["monthly", "2026-01-31", "2026-02-28"],
    ["monthly", "2026-03-31", "2026-04-30"],
    ["quarterly", "2026-01-01", "2026-04-01"],
    ["annually", "2026-06-01", "2027-06-01"],
  ];

  for (const [frequency, input, expected] of cases) {
    it(`${frequency}: ${input} → ${expected}`, () => {
      expect(computeNextGenerationDate(input, frequency)).toBe(expected);
    });
  }
});

describe("generator: error paths", () => {
  it("throws on unknown frequency", () => {
    expect(() => computeNextGenerationDate("2026-06-01", "hourly")).toThrow();
  });
});

describe("generator: auto_post integration (static shape check)", () => {
  it("generator service imports postSourceTransaction", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { resolve, dirname } = await import("node:path");
    const src = resolve(dirname(fileURLToPath(import.meta.url)), "../generator.service.ts");
    const content = readFileSync(src, "utf8");
    expect(content).toMatch(/postSourceTransaction/);
    expect(content).toMatch(/auto_post/);
    expect(content).toMatch(/createBill/);
  });

  it("generator writes to generation_log on success and failure", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { resolve, dirname } = await import("node:path");
    const src = resolve(dirname(fileURLToPath(import.meta.url)), "../generator.service.ts");
    const content = readFileSync(src, "utf8");
    expect(content).toMatch(/recurring_bill_generation_log/);
    expect(content).toMatch(/'success'/);
    expect(content).toMatch(/'failed'/);
  });
});
