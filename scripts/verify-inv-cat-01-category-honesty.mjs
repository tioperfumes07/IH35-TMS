#!/usr/bin/env node
/**
 * INV-CAT-01 — category column honesty + required create path.
 *
 * - InventoryPartsStockPage renders N/A for blank legacy category (not empty cells)
 * - PartCreateDrawer requires category from PART_INVENTORY_CATEGORIES
 * - Backend create rejects blank/null category
 * - Must NOT read deprecated catalogs.parts for category options
 *
 * Self-test: node scripts/verify-inv-cat-01-category-honesty.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STOCK_PAGE = "apps/frontend/src/pages/inventory/InventoryPartsStockPage.tsx";
const DRAWER = "apps/frontend/src/pages/inventory/PartCreateDrawer.tsx";
const TAXONOMY = "apps/frontend/src/pages/inventory/partInventoryCategories.ts";
const ROUTES = "apps/backend/src/maintenance/parts.routes.ts";
const LABEL = "verify-inv-cat-01-category-honesty";

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

/**
 * @param {{ stockPage: string, drawer: string, taxonomy: string, routes: string }} sources
 * @returns {string[]}
 */
export function collectProblems(sources) {
  const problems = [];
  const stockPage = stripComments(sources.stockPage);
  const drawer = stripComments(sources.drawer);
  const taxonomy = stripComments(sources.taxonomy);
  const routes = stripComments(sources.routes);

  if (!/displayPartInventoryCategory/.test(sources.stockPage)) {
    problems.push(`${STOCK_PAGE}: must use displayPartInventoryCategory for honest blank rendering`);
  }
  if (!/key:\s*["']category["'][\s\S]{0,400}render:/.test(stockPage)) {
    problems.push(`${STOCK_PAGE}: category column must have a render (N/A for blank)`);
  }
  if (!/N\/A/.test(sources.stockPage)) {
    problems.push(`${STOCK_PAGE}: blank category must render honest N/A`);
  }

  if (!/PART_INVENTORY_CATEGORIES/.test(sources.drawer)) {
    problems.push(`${DRAWER}: must load options from PART_INVENTORY_CATEGORIES`);
  }
  if (!/\brequired\b/.test(sources.drawer) || !/inv-part-category/.test(sources.drawer)) {
    problems.push(`${DRAWER}: category SelectCombobox must be required`);
  }
  if (/Category \*/.test(sources.drawer) === false && /Category\s*\*/.test(sources.drawer) === false) {
    problems.push(`${DRAWER}: category label must indicate required (Category *)`);
  }
  if (/catalogs\.parts/.test(drawer) || /catalogs\.parts/.test(taxonomy)) {
    problems.push("must not read deprecated catalogs.parts for inventory category options");
  }

  if (!/displayPartInventoryCategory/.test(taxonomy)) {
    problems.push(`${TAXONOMY}: must export displayPartInventoryCategory helper`);
  }

  if (!/partCategorySchema/.test(routes) || !/PART_INVENTORY_CATEGORY_VALUES/.test(routes)) {
    problems.push(`${ROUTES}: create/update must validate category against PART_INVENTORY_CATEGORY_VALUES`);
  }
  const createBlock = routes.match(/const createSchema = z\.object\(\{[\s\S]*?\}\);/);
  if (!createBlock || !/category:\s*partCategorySchema/.test(createBlock[0])) {
    problems.push(`${ROUTES}: createSchema must require category via partCategorySchema (no optional blank)`);
  }

  return problems;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  const real = {
    stockPage: read(STOCK_PAGE),
    drawer: read(DRAWER),
    taxonomy: read(TAXONOMY),
    routes: read(ROUTES),
  };
  const broken = {
    stockPage: `{ key: "category", label: "Category", sortable: true }`,
    drawer: `category: data.category.trim() || undefined`,
    taxonomy: `export const PART_INVENTORY_CATEGORIES = []`,
    routes: `category: z.string().trim().max(120).optional()`,
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
  const problems = collectProblems({
    stockPage: read(STOCK_PAGE),
    drawer: read(DRAWER),
    taxonomy: read(TAXONOMY),
    routes: read(ROUTES),
  });
  if (problems.length) {
    console.error(`${LABEL}: FAIL\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS`);
}
