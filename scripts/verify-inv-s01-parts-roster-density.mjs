#!/usr/bin/env node
/**
 * INV-S01 — /inventory Parts & Stock roster density must read maintenance.parts_inventory.
 *
 * Live Neon 2026-08-03 (bypass_rls=lucia, br-fancy-credit-akjnd07a):
 *   maintenance.parts_inventory TRANSP ≈144 rows; UI roster matches via canonical path.
 *
 *   node scripts/verify-inv-s01-parts-roster-density.mjs
 *   node scripts/verify-inv-s01-parts-roster-density.mjs --selftest
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const LABEL = "verify-inv-s01-parts-roster-density";

const PARTS_STOCK_PAGE = "apps/frontend/src/pages/inventory/InventoryPartsStockPage.tsx";
const PARTS_STOCK_TEST = "apps/frontend/src/pages/inventory/InventoryPartsStockPage.test.ts";
const MAINTENANCE_API = "apps/frontend/src/api/maintenance.ts";
const PARTS_ROUTES = "apps/backend/src/maintenance/parts.routes.ts";

function read(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|--|\*)/.test(l))
    .join("\n");
}

/**
 * @param {Record<string, string>} files
 * @returns {string[]}
 */
export function collectProblems(files) {
  const problems = [];
  const page = files[PARTS_STOCK_PAGE] ?? "";
  const pageCode = stripComments(page);
  const pageTest = files[PARTS_STOCK_TEST] ?? "";
  const api = files[MAINTENANCE_API] ?? "";
  const routes = files[PARTS_ROUTES] ?? "";

  if (!/listMaintenanceParts/.test(page)) {
    problems.push(`${PARTS_STOCK_PAGE}: Parts & Stock roster must call listMaintenanceParts(`);
  }
  if (/listPartsInventory/.test(pageCode)) {
    problems.push(`${PARTS_STOCK_PAGE}: must not use listPartsInventory (maintenance tab path, not inventory roster)`);
  }
  if (/fetch\s*\(\s*resolveApiUrl/.test(pageCode)) {
    problems.push(`${PARTS_STOCK_PAGE}: must not raw-fetch — use listMaintenanceParts (apiRequest)`);
  }
  if (/\/api\/v1\/inventory\/parts/.test(pageCode)) {
    problems.push(`${PARTS_STOCK_PAGE}: phantom /api/v1/inventory/parts route must not be used`);
  }
  if (/catalogs\.parts/.test(pageCode)) {
    problems.push(`${PARTS_STOCK_PAGE}: must not read deprecated catalogs.parts for roster`);
  }
  if (!/maintenance\.parts_inventory/.test(page)) {
    problems.push(`${PARTS_STOCK_PAGE}: comment/doc must anchor roster to maintenance.parts_inventory canonical table`);
  }

  if (!/listMaintenanceParts/.test(api)) {
    problems.push(`${MAINTENANCE_API}: must export listMaintenanceParts`);
  }
  if (!/\/api\/v1\/maintenance\/parts\?/.test(api)) {
    problems.push(`${MAINTENANCE_API}: listMaintenanceParts must hit /api/v1/maintenance/parts`);
  }
  if (!/FROM maintenance\.parts_inventory/.test(routes)) {
    problems.push(`${PARTS_ROUTES}: GET must SELECT FROM maintenance.parts_inventory`);
  }
  if (/FROM catalogs\.parts|FROM maint\.part/.test(routes)) {
    problems.push(`${PARTS_ROUTES}: must not query legacy catalogs.parts or maint.part`);
  }

  if (!/listMaintenanceParts/.test(pageTest)) {
    problems.push(`${PARTS_STOCK_TEST}: must lock listMaintenanceParts read path`);
  }

  return problems;
}

const files = Object.fromEntries(
  [PARTS_STOCK_PAGE, PARTS_STOCK_TEST, MAINTENANCE_API, PARTS_ROUTES].map((rel) => [rel, read(rel)]),
);

if (SELFTEST) {
  const planted = {
    ...files,
    [PARTS_STOCK_PAGE]: files[PARTS_STOCK_PAGE]
      .replace(/listMaintenanceParts/g, "listPartsInventory")
      .replace(/maintenance\.parts_inventory/g, "catalogs.parts"),
    [PARTS_ROUTES]: files[PARTS_ROUTES].replace(
      /FROM maintenance\.parts_inventory/g,
      "FROM catalogs.parts",
    ),
  };
  const caught = collectProblems(planted);
  if (!caught.length) {
    console.error(`${LABEL} SELFTEST FAIL — planted catalogs.parts path not caught`);
    process.exit(1);
  }
  const live = collectProblems(files);
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAIL — live repo flagged:`);
    for (const p of live) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = collectProblems(files);
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(
  `${LABEL}: OK — Inventory Parts & Stock roster reads maintenance.parts_inventory via listMaintenanceParts → /api/v1/maintenance/parts (Neon lucia TRANSP ≈144)`,
);
process.exit(0);
