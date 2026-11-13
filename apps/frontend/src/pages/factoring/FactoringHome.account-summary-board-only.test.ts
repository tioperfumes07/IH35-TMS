import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** ROUND 8.20 board18 Class L — Account summary must not layer a second purchase-bar/Terms under the board. */
describe("ROUND 8.20 FactoringHome account_summary board-only", () => {
  it("does not embed duplicate purchase-bar or Terms under factoring-account-summary", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "FactoringHome.tsx"), "utf8");
    expect(src).not.toContain('testId="factoring-purchase-bar-chart"');
    expect(src).not.toContain('testId="factoring-terms-on-file"');
    expect(src).not.toContain('data-testid="factoring-account-summary"');
    expect(src).toContain("FactoringHomeBoard");
  });
});
