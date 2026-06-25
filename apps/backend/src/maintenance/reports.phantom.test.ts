import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guard for reports.routes.ts. inspection_pass_fail_rate read a phantom
 * maintenance.dot_inspection_events (42P01). The canonical compliance.dot_inspection_events
 * is a dwell-event table with no pass/fail `outcome` column, so the report now degrades to []
 * behind an information_schema column check instead of throwing. This guard ensures:
 *   1. the phantom maintenance.dot_inspection_events does not creep back, and
 *   2. the degrade-safe column guard stays in place (so it can't silently become a hard 42703).
 */
const SRC = join(dirname(fileURLToPath(import.meta.url)), "reports.routes.ts");

describe("reports.routes phantom-relation + degrade-safe guard", () => {
  const src = readFileSync(SRC, "utf8");

  it("does not query phantom maintenance.dot_inspection_events", () => {
    expect(/\b(from|join|into|update)\s+maintenance\.dot_inspection_events\b/i.test(src)).toBe(false);
  });

  it("keeps the inspection_pass_fail_rate outcome-column existence guard", () => {
    // degrade-safe path: check the column exists in compliance.dot_inspection_events before grouping
    expect(src).toMatch(/information_schema\.columns/);
    expect(src).toMatch(/column_name = 'outcome'/);
    expect(src).toMatch(/compliance\.dot_inspection_events/);
  });
});
