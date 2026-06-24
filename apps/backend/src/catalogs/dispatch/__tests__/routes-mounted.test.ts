import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

// CI GUARD (2026-06-24) — FIX-3. The dispatch catalog routes (additional-charges etc.) 404'd in prod
// because registerDispatchCatalogRoutes was defined but NEVER called in apps/backend/src/index.ts (its
// sibling catalog indexes ARE called). This static guard fails if the mount is ever removed again — it
// catches the regression the route-level e2e cannot (that test registers its own app).
const here = path.dirname(fileURLToPath(import.meta.url));
const INDEX_TS = path.resolve(here, "../../../index.ts"); // apps/backend/src/index.ts

describe("dispatch catalog routes are mounted in index.ts (FIX-3 guard)", () => {
  const src = readFileSync(INDEX_TS, "utf8");

  it("index.ts imports registerDispatchCatalogRoutes from the dispatch catalog index", () => {
    expect(src).toMatch(/import\s*\{\s*registerDispatchCatalogRoutes\s*\}\s*from\s*["']\.\/catalogs\/dispatch\/index\.js["']/);
  });

  it("index.ts actually CALLS registerDispatchCatalogRoutes(app) (the route is wired into the app)", () => {
    expect(src).toMatch(/registerDispatchCatalogRoutes\s*\(\s*app\s*\)/);
  });
});
