#!/usr/bin/env node
/**
 * verify-catalog-mutation-routes-set-company-scope.mjs  (CLS-CATALOG-MUTATION-RLS-SILENT-404)
 *
 * Root cause: apps/backend/src/catalogs/generic-catalog.factory.ts's PATCH/DELETE/restore route
 * handlers used plain withCurrentUser with a bare `WHERE id = $1` UPDATE, while CREATE (POST)
 * correctly branches to withCompanyScope for entity-scoped catalogs. Every entity-scoped
 * catalogs.* table carries a FORCE RLS `company_scope` policy requiring `operating_company_id =
 * current_setting('app.operating_company_id', true)` -- only withCompanyScope sets that GUC
 * (fleet/shared.ts). A session that never sets it has the setting NULL, so the RLS predicate is
 * always false and the mutation UPDATE silently matches zero rows regardless of id, surfacing a
 * false catalog_<table>_not_found for a row that visibly exists. Live-reproduced 2026-08-22 on
 * fuel.def_stations: Edit surfaced "Failed to save catalog row: catalog_def_stations_not_found"
 * in the form, and Archive failed the exact same way with ZERO toast/error at all -- a true
 * silent no-op -- for a row this session had just created and could see in the table. This is a
 * systemic defect across every one of the 29+ catalog configs this file registers with mode
 * "all": PATCH/DELETE/restore were never entity-scope-aware.
 *
 * This guard makes the regression impossible to re-ship: PATCH, DELETE, and the restore route
 * must each branch on `entityScoped` to call `withCompanyScope(...)` (never plain
 * `withCurrentUser` unconditionally), matching the create route directly above them.
 *
 * Usage:
 *   node scripts/verify-catalog-mutation-routes-set-company-scope.mjs            # scan
 *   node scripts/verify-catalog-mutation-routes-set-company-scope.mjs --selftest # regression harness -> must FAIL on bug
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const FACTORY_FILE = "apps/backend/src/catalogs/generic-catalog.factory.ts";

const ROUTE_MARKERS = [
  { name: "PATCH (edit)", marker: "app.patch(`${basePath}/:id`" },
  { name: "DELETE (archive)", marker: "app.delete(`${basePath}/:id`" },
  { name: "POST restore", marker: "app.post(`${basePath}/:id/restore`" },
];

/**
 * For each mutation route, take the source slice from its registration to the next route
 * registration (or EOF) and require it to branch to withCompanyScope for the entityScoped case —
 * never call withCurrentUser unconditionally for the same handler.
 */
export function checkRoutesUseCompanyScope(src) {
  const offenders = [];
  const markerIndexes = ROUTE_MARKERS.map((r) => ({ ...r, idx: src.indexOf(r.marker) }));
  for (const { name, marker, idx } of markerIndexes) {
    if (idx === -1) {
      offenders.push(`${FACTORY_FILE}: route marker not found — ${marker} (has this route moved or been renamed?)`);
      continue;
    }
    const nextIdx = Math.min(
      ...markerIndexes.filter((m) => m.idx > idx).map((m) => m.idx),
      src.indexOf("app.get(`${basePath}/export.csv`", idx) === -1 ? Infinity : src.indexOf("app.get(`${basePath}/export.csv`", idx),
      src.length
    );
    const slice = src.slice(idx, nextIdx);
    const usesCompanyScope = /entityScoped\s*\n?\s*\?\s*await withCompanyScope\(/.test(slice);
    // Unconditional plain withCurrentUser (not the `: await withCurrentUser` branch of the same
    // ternary) is the exact regression shape.
    const bareWithCurrentUser = /=\s*await withCurrentUser\(authUser\.uuid,\s*(async\s*\(client\)|run[A-Z])/.test(slice) && !usesCompanyScope;
    if (!usesCompanyScope) {
      offenders.push(`${FACTORY_FILE}: ${name} route never branches to withCompanyScope for entityScoped catalogs — RLS will silently zero every mutation`);
    }
    if (bareWithCurrentUser) {
      offenders.push(`${FACTORY_FILE}: ${name} route calls withCurrentUser unconditionally — CLS-CATALOG-MUTATION-RLS-SILENT-404 regression shape`);
    }
  }
  return offenders;
}

export function run() {
  const abs = path.join(repoRoot, FACTORY_FILE);
  const src = fs.readFileSync(abs, "utf8");
  const offenders = checkRoutesUseCompanyScope(src);
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggyPatch = `
    app.patch(\`\${basePath}/:id\`, async (req, reply) => {
      const updated = await withCurrentUser(authUser.uuid, async (client) => {
        return { row: {} };
      });
    });
    app.delete(\`\${basePath}/:id\`, async (req, reply) => {
      const result = await withCurrentUser(authUser.uuid, runDelete);
    });
    app.post(\`\${basePath}/:id/restore\`, async (req, reply) => {
      const restored = await withCurrentUser(authUser.uuid, runRestore);
    });
  `;
  const fixedPatch = `
    app.patch(\`\${basePath}/:id\`, async (req, reply) => {
      const updated = entityScoped
        ? await withCompanyScope(authUser.uuid, operatingCompanyId, runUpdate)
        : await withCurrentUser(authUser.uuid, runUpdate);
    });
    app.delete(\`\${basePath}/:id\`, async (req, reply) => {
      const result = entityScoped
        ? await withCompanyScope(authUser.uuid, operatingCompanyId, runDelete)
        : await withCurrentUser(authUser.uuid, runDelete);
    });
    app.post(\`\${basePath}/:id/restore\`, async (req, reply) => {
      const restored = entityScoped
        ? await withCompanyScope(authUser.uuid, operatingCompanyId, runRestore)
        : await withCurrentUser(authUser.uuid, runRestore);
    });
  `;

  const buggyFails = checkRoutesUseCompanyScope(buggyPatch).length > 0;
  const fixedPasses = checkRoutesUseCompanyScope(fixedPatch).length === 0;

  if (buggyFails && fixedPasses) {
    console.log("verify:catalog-mutation-routes-set-company-scope selftest OK");
    process.exit(0);
  }
  console.error("verify:catalog-mutation-routes-set-company-scope selftest FAILED", { buggyFails, fixedPasses });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error("verify:catalog-mutation-routes-set-company-scope FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "));
    process.exit(1);
  }
  console.log("verify:catalog-mutation-routes-set-company-scope OK — PATCH/DELETE/restore all set company scope for entity-scoped catalogs");
}
