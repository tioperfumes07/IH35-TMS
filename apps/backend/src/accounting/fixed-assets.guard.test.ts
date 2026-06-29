import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect } from "vitest";

// CASCADE-12 static guard: Fixed Assets module must stay READ-ONLY, entity-scoped, and never post
// GL while the autopost flag is OFF (it never posts at all in this module).
const here = dirname(fileURLToPath(import.meta.url));
const route = readFileSync(resolve(here, "fixed-assets.routes.ts"), "utf8");

describe("fixed-assets routes guard", () => {
  it("is read-only — no INSERT/UPDATE/DELETE against accounting tables", () => {
    expect(route).not.toMatch(/INSERT\s+INTO/i);
    expect(route).not.toMatch(/UPDATE\s+accounting\./i);
    expect(route).not.toMatch(/DELETE\s+FROM/i);
  });

  it("never posts a journal entry (no GL write)", () => {
    expect(route).not.toMatch(/INSERT\s+INTO\s+accounting\.journal_entries/i);
    // JE preview is a template only, gated behind the autopost flag.
    expect(route).toContain("FIXED_ASSET_AUTOPOST_ENABLED");
    expect(route).toContain("posting_enabled");
  });

  it("is entity-scoped (operating_company_id) on every query", () => {
    expect(route).toContain("withCompanyScope");
    expect(route).toMatch(/operating_company_id\s*=\s*\$1/);
  });

  it("preserves the owner-vs-operator distinction", () => {
    expect(route).toContain("owner_operating_company_id");
    expect(route).toContain("is_owner_operated");
  });

  it("has no stub / placeholder strings", () => {
    expect(route).not.toMatch(/TODO|FIXME|coming soon|not implemented/i);
  });
});
