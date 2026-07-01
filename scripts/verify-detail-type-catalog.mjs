#!/usr/bin/env node
// Block 4 static CI guard — locks the Detail Type catalog wiring (CLAUDE.md §2).
//
// Invariants:
//   (1) The migration EXTENDS catalogs.detail_types (adds operating_company_id + is_system) and does
//       NOT create a duplicate account_detail_types table.
//   (2) The backend detail-types CRUD route is registered.
//   (3) Lists surfaces BOTH Account Type (read-only) and Detail Type (creator), and the manifest routes
//       resolve them (frontend vitest does not gate CI, so this .mjs is the real gate).
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => (fs.existsSync(path.join(root, p)) ? fs.readFileSync(path.join(root, p), "utf8") : "");
const failures = [];

const mig = read("db/migrations/202607011700_detail_types_per_entity_custom.sql");
if (!mig) failures.push("missing migration 202607011700_detail_types_per_entity_custom.sql");
else {
  if (!/ALTER TABLE catalogs\.detail_types/.test(mig)) failures.push("migration must ALTER (extend) catalogs.detail_types");
  if (/CREATE TABLE[^;]*account_detail_types/i.test(mig)) failures.push("migration must NOT create a duplicate account_detail_types table");
  if (!/ADD COLUMN IF NOT EXISTS operating_company_id/.test(mig) || !/ADD COLUMN IF NOT EXISTS is_system/.test(mig)) failures.push("migration must add operating_company_id + is_system");
}

const index = read("apps/backend/src/catalogs/accounting/index.ts");
if (!/registerDetailTypesCatalogRoutes\(app\)/.test(index)) failures.push("registerDetailTypesCatalogRoutes must be registered in catalogs/accounting/index.ts");

const routeSrc = read("apps/backend/src/catalogs/accounting/detail-types-catalog.routes.ts");
if (!/detail_type_is_system/.test(routeSrc)) failures.push("detail-types route must seed-lock system rows (detail_type_is_system)");

const map = read("apps/frontend/src/pages/lists/components/AllCatalogsMap.tsx");
if (!/catalogKey: "account-types"/.test(map)) failures.push("AllCatalogsMap must register Account Type (account-types)");
if (!/catalogKey: "detail-types"/.test(map)) failures.push("AllCatalogsMap must register Detail Type (detail-types)");

const manifest = read("apps/frontend/src/routes/manifest.tsx");
if (!/path="\/lists\/accounting\/account-types"/.test(manifest)) failures.push("manifest must route /lists/accounting/account-types");
if (!/path="\/lists\/accounting\/detail-types"/.test(manifest) || !/<DetailTypesListPage \/>/.test(manifest)) failures.push("manifest must route /lists/accounting/detail-types → DetailTypesListPage");

if (failures.length) {
  console.error("verify:detail-type-catalog — FAILED");
  for (const m of failures) console.error(`- ${m}`);
  process.exit(1);
}
console.log("verify:detail-type-catalog — OK");
