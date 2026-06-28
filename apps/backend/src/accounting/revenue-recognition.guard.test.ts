import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect } from "vitest";

// CASCADE-13 static guard: Revenue Recognition module must stay READ-ONLY, entity-scoped, and never
// post GL while REVENUE_RECOGNITION_POST_ENABLED is OFF (it never posts in this module).
const here = dirname(fileURLToPath(import.meta.url));
const route = readFileSync(resolve(here, "revenue-recognition.routes.ts"), "utf8");

describe("revenue-recognition routes guard", () => {
  it("is read-only — no INSERT/UPDATE/DELETE against accounting tables", () => {
    expect(route).not.toMatch(/INSERT\s+INTO/i);
    expect(route).not.toMatch(/UPDATE\s+accounting\./i);
    expect(route).not.toMatch(/DELETE\s+FROM/i);
  });

  it("never posts a journal entry (no GL write)", () => {
    expect(route).not.toMatch(/INSERT\s+INTO\s+accounting\.journal_entries/i);
    expect(route).toContain("REVENUE_RECOGNITION_POST_ENABLED");
    expect(route).toContain("posting_enabled");
  });

  it("is entity-scoped (operating_company_id) via withCompanyScope", () => {
    expect(route).toContain("withCompanyScope");
    expect(route).toMatch(/operating_company_id\s*=\s*\$1/);
  });

  it("models ASC 606 (contracts -> obligations -> recognition rows)", () => {
    expect(route).toContain("revenue_contracts");
    expect(route).toContain("revenue_obligations");
    expect(route).toContain("over_time_straight_line");
    expect(route).toContain("point_in_time");
  });

  it("has no stub / placeholder strings", () => {
    expect(route).not.toMatch(/TODO|FIXME|coming soon|not implemented/i);
  });
});
