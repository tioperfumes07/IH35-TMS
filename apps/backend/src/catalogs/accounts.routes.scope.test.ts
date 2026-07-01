import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Static regression guard for A1 (CALLOUT-6). catalogs.accounts is per-entity: the af1 RLS policy
// (accounts_entity_select) returns rows only where operating_company_id = current_setting(app.operating_company_id).
// A read under withCurrentUser WITHOUT that GUC returns ZERO rows (the empty "Select account" picker) and would
// be a cross-entity leak if it ever returned rows. This guard fails if either read route regresses to an
// unscoped read. (GUARD independently branch-proves the live isolation; this just stops a silent revert.)
const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(here, "accounts.routes.ts"), "utf8");

function sliceBetween(src: string, startNeedle: string, endNeedle: string): string {
  const start = src.indexOf(startNeedle);
  const end = src.indexOf(endNeedle, start + startNeedle.length);
  return src.slice(start, end === -1 ? undefined : end);
}

describe("catalogs.accounts read routes are entity-scoped (A1 / af1 RLS)", () => {
  it("wires the scoping primitives: withScopedCompany + GUC + membership assertion", () => {
    expect(SRC).toContain("withScopedCompany");
    expect(SRC).toContain("set_config('app.operating_company_id'");
    expect(SRC).toContain("assertCompanyMembership");
  });

  it("GET /api/v1/catalogs/accounts (list) reads under withScopedCompany", () => {
    const handler = sliceBetween(SRC, 'app.get("/api/v1/catalogs/accounts"', 'app.post("/api/v1/catalogs/accounts"');
    expect(handler).toContain("withScopedCompany");
    expect(handler).not.toContain("await withCurrentUser(authUser.uuid, async (client) => {");
  });

  it("GET /api/v1/catalogs/accounts/:id reads under withScopedCompany", () => {
    const handler = sliceBetween(SRC, 'app.get("/api/v1/catalogs/accounts/:id"', 'app.patch("/api/v1/catalogs/accounts/:id"');
    expect(handler).toContain("withScopedCompany");
  });
});

// Static regression guard for the WRITE path (#1708). Under af1 FORCE RLS, create/update/deactivate must
// set app.operating_company_id (and create must STORE operating_company_id) or accounts_entity_write's
// WITH CHECK rejects the write. This fails if any write route regresses to an unscoped write.
describe("catalogs.accounts write routes are entity-scoped (write-path / af1 RLS)", () => {
  it("POST create sets the GUC and stores operating_company_id in the INSERT", () => {
    const handler = sliceBetween(SRC, 'app.post("/api/v1/catalogs/accounts"', 'app.get("/api/v1/catalogs/accounts/:id"');
    expect(handler).toContain("set_config('app.operating_company_id'");
    expect(handler).toMatch(/INSERT INTO catalogs\.accounts[\s\S]*operating_company_id/);
  });

  it("PATCH update sets the GUC before the read/write", () => {
    const handler = sliceBetween(SRC, 'app.patch("/api/v1/catalogs/accounts/:id"', 'app.post("/api/v1/catalogs/accounts/:id/deactivate"');
    expect(handler).toContain("set_config('app.operating_company_id'");
  });

  it("POST deactivate sets the GUC before the read/write", () => {
    const start = SRC.indexOf('app.post("/api/v1/catalogs/accounts/:id/deactivate"');
    expect(SRC.slice(start)).toContain("set_config('app.operating_company_id'");
  });
});
