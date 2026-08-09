#!/usr/bin/env node
/**
 * LST-F100 / C-10 — Lists Safety subnav must include every live DOMAIN_CONFIG safety catalogKey
 * (not a hard-coded 3-of-N subset). Source of truth = AllCatalogsMap DOMAIN_CONFIG.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SUBNAV = "apps/frontend/src/pages/lists/ListsSubNav.tsx";
const MAP = "apps/frontend/src/pages/lists/components/AllCatalogsMap.tsx";
const LABEL = "verify-lists-safety-subnav-complete";
const SELFTEST = process.argv.includes("--selftest");

function liveSafetyKeys(mapSrc) {
  const safetyBlock = mapSrc.match(/key:\s*"safety"[\s\S]*?catalogs:\s*\[([\s\S]*?)\],\s*\},/);
  if (!safetyBlock) return [];
  const keys = [];
  const re = /\{\s*name:\s*"[^"]+"\s*,\s*description:\s*"[^"]*"\s*,\s*live:\s*(true|false)\s*,\s*catalogKey:\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(safetyBlock[1]))) {
    if (m[1] === "true") keys.push(m[2]);
  }
  return [...new Set(keys)];
}

function assert(subnavSrc, mapSrc) {
  const problems = [];
  if (!/DOMAIN_CONFIG/.test(subnavSrc) || !/buildCatalogPath/.test(subnavSrc)) {
    problems.push(`${SUBNAV}: must derive Safety children from DOMAIN_CONFIG + buildCatalogPath`);
  }
  if (!/safetyCatalogNavChildren|SAFETY_CATALOG_CHILDREN/.test(subnavSrc)) {
    problems.push(`${SUBNAV}: must build Safety catalog children from live DOMAIN_CONFIG entries`);
  }
  const keys = liveSafetyKeys(mapSrc);
  if (keys.length < 6) {
    problems.push(`${MAP}: expected ≥6 live safety catalogKeys, got ${keys.length}`);
  }
  // Hard-coded 3-only subset is the defect class — forbid the old literal trio-only children block.
  if (
    /Internal Fine Reasons[\s\S]*Civil Fine Types[\s\S]*Company Violation Types[\s\S]*\]/.test(subnavSrc) &&
    !/DOMAIN_CONFIG/.test(subnavSrc)
  ) {
    problems.push(`${SUBNAV}: hard-coded 3-catalog Safety children without DOMAIN_CONFIG derivation`);
  }
  return problems;
}

const subnavPath = path.join(ROOT, SUBNAV);
const mapPath = path.join(ROOT, MAP);

if (SELFTEST) {
  const liveSub = fs.readFileSync(subnavPath, "utf8");
  const liveMap = fs.readFileSync(mapPath, "utf8");
  const planted = `export const LISTS_SUB_NAV_ITEMS = [
  { label: "Safety catalogs", href: "/lists/safety/internal-fine-reasons", children: [
      { label: "Internal Fine Reasons", href: "/lists/safety/internal-fine-reasons" },
      { label: "Civil Fine Types", href: "/lists/safety/civil-fine-types" },
      { label: "Company Violation Types", href: "/lists/safety/company-violation-types" },
    ] },
];`;
  if (!assert(planted, liveMap).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted 3-of-N not caught`);
    process.exit(1);
  }
  const liveProblems = assert(liveSub, liveMap);
  if (liveProblems.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${liveProblems.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assert(fs.readFileSync(subnavPath, "utf8"), fs.readFileSync(mapPath, "utf8"));
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — Safety subnav derives from DOMAIN_CONFIG (${liveSafetyKeys(fs.readFileSync(mapPath, "utf8")).length} live keys)`);
