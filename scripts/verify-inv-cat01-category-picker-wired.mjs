#!/usr/bin/env node
/**
 * INV-CAT-01 / VERIFY-2 — Inventory PartCreateDrawer Category must be a real SelectCombobox
 * over PART_INVENTORY_CATEGORIES writing maintenance.parts_inventory.category.
 * Must NOT seed/read deprecated catalogs.parts for options.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DRAWER = "apps/frontend/src/pages/inventory/PartCreateDrawer.tsx";
const TAXONOMY = "apps/frontend/src/pages/inventory/partInventoryCategories.ts";
const MIGRATION = "db/migrations/202611161200_inv_cat01_backfill_parts_inventory_category.sql";
const LABEL = "verify-inv-cat01-category-picker-wired";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|--|\*)/.test(l))
    .join("\n");
}

export function collectProblems(
  sources = {
    drawer: read(DRAWER),
    taxonomy: read(TAXONOMY),
    migration: read(MIGRATION),
  }
) {
  const problems = [];
  const drawer = stripComments(sources.drawer);
  const taxonomy = stripComments(sources.taxonomy);
  const migration = sources.migration;

  if (!/SelectCombobox/.test(sources.drawer)) {
    problems.push(`${DRAWER}: Category must use SelectCombobox (not free-text input)`);
  }
  if (!/PART_INVENTORY_CATEGORIES/.test(sources.drawer)) {
    problems.push(`${DRAWER}: must load options from PART_INVENTORY_CATEGORIES`);
  }
  if (/placeholder\s*=\s*["']Select or add category["']/.test(sources.drawer)) {
    problems.push(`${DRAWER}: picker-shaped free-text placeholder must be removed`);
  }
  // Bare category <input> (not MoneyInput / other fields) — detect label Category followed by input
  if (/Category[\s\S]{0,200}<input[\s\S]{0,120}category/i.test(drawer) && !/SelectCombobox[\s\S]{0,200}category/i.test(drawer)) {
    problems.push(`${DRAWER}: Category field still looks like a free-text <input>`);
  }
  if (!/PART_INVENTORY_CATEGORIES\s*=/.test(taxonomy)) {
    problems.push(`${TAXONOMY}: must export PART_INVENTORY_CATEGORIES`);
  }
  if (!/engine_lubrication/.test(taxonomy) || !/fuel_system/.test(taxonomy)) {
    problems.push(`${TAXONOMY}: taxonomy must include engine_lubrication + fuel_system (0277 seed vocabulary)`);
  }
  if (/catalogs\.parts/.test(drawer) || /catalogs\.parts/.test(taxonomy)) {
    problems.push(`must not read deprecated catalogs.parts for inventory category options`);
  }
  if (!/maintenance\.parts_inventory/.test(migration)) {
    problems.push(`${MIGRATION}: must target maintenance.parts_inventory`);
  }
  if (!/SET\s+category\s*=\s*location/i.test(migration) && !/category = location/i.test(migration)) {
    problems.push(`${MIGRATION}: must backfill category from location`);
  }
  if (!/location\s*=\s*NULL/i.test(migration)) {
    problems.push(`${MIGRATION}: must clear location after moving taxonomy tokens to category`);
  }

  return problems;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  const real = { drawer: read(DRAWER), taxonomy: read(TAXONOMY), migration: read(MIGRATION) };
  const broken = {
    ...real,
    drawer: `label Category\n<input placeholder="Select or add category" value={formData.category} />`,
    taxonomy: `export const X = []`,
    migration: `-- noop`,
  };
  if (collectProblems(broken).length === 0) {
    console.error(`${LABEL} --selftest FAIL: broken sources not flagged`);
    process.exit(1);
  }
  const good = collectProblems(real);
  if (good.length) {
    console.error(`${LABEL} --selftest FAIL:\n${good.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

if (IS_MAIN) {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL}: FAIL\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS`);
}
