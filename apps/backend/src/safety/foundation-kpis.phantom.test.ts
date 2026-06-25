import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Phantom-relation guard. The DOT-Inspections KPI queried maintenance.dot_inspection_events,
 * which does not exist (42P01). The query was wrapped in `.catch(() => count 0)`, so it never
 * threw — it silently reported 0 DOT inspections forever. Real table = compliance.dot_inspection_events
 * (id, operating_company_id, unit_id, ...). Validated read-only against prod (COUNT → 200).
 * Scoped to this file so it stays green and bites on regression here.
 */
const SRC = join(dirname(fileURLToPath(import.meta.url)), "foundation-kpis.routes.ts");

describe("foundation-kpis phantom-relation guard", () => {
  it("does not query maintenance.dot_inspection_events (phantom; real = compliance.*)", () => {
    const src = readFileSync(SRC, "utf8");
    expect(/\b(from|join|into|update)\s+maintenance\.dot_inspection_events\b/i.test(src)).toBe(false);
  });
});
