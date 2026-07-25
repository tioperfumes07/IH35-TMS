#!/usr/bin/env node
/**
 * GUARD (LST-F01 / LST-COUNT-01): /lists inventory must count from LISTS_MODULE_COUNT_SPECS,
 * not views.catalogs_inventory (QBO remote feed).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HUB = "apps/backend/src/lists/lists-hub.routes.ts";
const LABEL = "verify-lists-inventory-from-count-spec";

function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join("\n");
}

export function assertInventoryFromCountSpec(src) {
  const problems = [];
  const c = code(src);
  const invBlock = c.match(/app\.get\(\s*["']\/api\/v1\/lists\/inventory["'][\s\S]*?(?=app\.get\(|app\.post\(|$)/);
  if (!invBlock) {
    problems.push(`${HUB}: /api/v1/lists/inventory route missing`);
    return problems;
  }
  const block = invBlock[0];
  if (/views\.catalogs_inventory/.test(block)) {
    problems.push(`${HUB}: inventory still reads views.catalogs_inventory (QBO remote) — LST-F01`);
  }
  if (!/LISTS_MODULE_COUNT_SPECS/.test(block) && !/buildCanonicalInventory|buildModuleCountQuery/.test(c)) {
    problems.push(`${HUB}: inventory must derive from LISTS_MODULE_COUNT_SPECS / buildModuleCountQuery`);
  }
  if (!/LISTS_MODULE_COUNT_SPECS/.test(c)) {
    problems.push(`${HUB}: must import/use LISTS_MODULE_COUNT_SPECS`);
  }
  return problems;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN && process.argv.includes("--selftest")) {
  const real = fs.readFileSync(path.join(ROOT, HUB), "utf8");
  const broken = real.replace(
    /buildCanonicalInventory[\s\S]*?query\.data\.operating_company_id\s*\)/,
    `client.query(\`SELECT domain, catalog_key, display_name, row_count FROM views.catalogs_inventory\`)`
  );
  if (assertInventoryFromCountSpec(broken).length === 0) {
    console.error(`${LABEL} --selftest FAIL: QBO view not flagged`);
    process.exit(1);
  }
  const good = assertInventoryFromCountSpec(real);
  if (good.length) {
    console.error(`${LABEL} --selftest FAIL:\n${good.join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}
if (IS_MAIN) {
  const src = fs.readFileSync(path.join(ROOT, HUB), "utf8");
  const problems = assertInventoryFromCountSpec(src);
  if (problems.length) {
    console.error(`${LABEL} FAIL:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — inventory derives from count-spec, not QBO remote view.`);
}
