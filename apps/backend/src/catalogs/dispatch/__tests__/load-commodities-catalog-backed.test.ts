import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

// WIZ-24 GUARD (2026-09-04). The Book Load "Commodity" combobox calls
// GET /api/v1/catalogs/dispatch/load-commodities. The route was registered but catalogs.load_commodities
// was never created, so the query failed and the browser saw "Could not load commodities" (the endpoint
// did not return catalog JSON). This static guard fails if the backing table's migration is removed OR
// the route stops being registered — the two ways the endpoint could regress to a non-JSON / empty state.
// It reproduces the ROOT CAUSE (missing table), which a route-level e2e that registers its own app cannot.
const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(here, "../../../../../../db/migrations");
const DISPATCH_INDEX = path.resolve(here, "../index.ts");
const ROUTE_FILE = path.resolve(here, "../load-commodities.routes.ts");

function migrationSources(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"));
}

describe("WIZ-24 — load-commodities catalog is backed by a table (endpoint returns JSON, never HTML)", () => {
  const migrations = migrationSources();

  it("a migration CREATEs catalogs.load_commodities", () => {
    const creates = migrations.filter((sql) => /create\s+table\s+(if\s+not\s+exists\s+)?catalogs\.load_commodities\b/i.test(sql));
    expect(creates.length).toBeGreaterThan(0);
  });

  it("that table enables AND forces row level security and grants ih35_app", () => {
    const backing = migrations.find((sql) => /create\s+table\s+(if\s+not\s+exists\s+)?catalogs\.load_commodities\b/i.test(sql)) ?? "";
    expect(backing).toMatch(/alter\s+table\s+catalogs\.load_commodities\s+enable\s+row\s+level\s+security/i);
    expect(backing).toMatch(/alter\s+table\s+catalogs\.load_commodities\s+force\s+row\s+level\s+security/i);
    expect(backing).toMatch(/grant\s+select,\s*insert,\s*update,\s*delete\s+on\s+catalogs\.load_commodities\s+to\s+ih35_app/i);
  });

  it("the load-commodities route is registered on the dispatch catalog index with tableName load_commodities", () => {
    const index = readFileSync(DISPATCH_INDEX, "utf8");
    expect(index).toMatch(/registerLoadCommoditiesCatalogRoutes\s*\(\s*app\s*\)/);
    const route = readFileSync(ROUTE_FILE, "utf8");
    expect(route).toMatch(/catalogPath:\s*["']load-commodities["']/);
    expect(route).toMatch(/tableName:\s*["']load_commodities["']/);
  });
});
