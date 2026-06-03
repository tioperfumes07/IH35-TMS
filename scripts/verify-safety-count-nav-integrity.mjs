#!/usr/bin/env node
/**
 * Block A23-2: Safety module count + nav integrity (canonical 27 tabs / 9 groups).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const EXPECTED_TAB_COUNT = 27;
const EXPECTED_GROUP_COUNT = 9;

const paths = {
  tabsConfig: path.join(ROOT, "apps/frontend/src/components/safety/SAFETY_TABS_CONFIG.ts"),
  homePage: path.join(ROOT, "apps/frontend/src/pages/home/HomePage.tsx"),
  sidebarConfig: path.join(ROOT, "apps/frontend/src/components/layout/sidebar-config.ts"),
  archDesign: path.join(ROOT, "docs/specs/IH35_ARCHITECTURAL_DESIGN.md"),
  foundationKpis: path.join(ROOT, "apps/backend/src/safety/foundation-kpis.routes.ts"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`[verify-safety-count-nav-integrity] ${msg}`);
  process.exit(1);
}

function main() {
  const tabsConfig = read(paths.tabsConfig);
  const homePage = read(paths.homePage);
  const sidebarConfig = read(paths.sidebarConfig);
  const archDesign = read(paths.archDesign);
  const foundationKpis = read(paths.foundationKpis);
  const failures = [];

  if (!tabsConfig.includes(`SAFETY_CANONICAL_TAB_COUNT = ${EXPECTED_TAB_COUNT}`)) {
    failures.push("SAFETY_CANONICAL_TAB_COUNT must be 27");
  }
  if (!tabsConfig.includes(`SAFETY_CANONICAL_GROUP_COUNT = ${EXPECTED_GROUP_COUNT}`)) {
    failures.push("SAFETY_CANONICAL_GROUP_COUNT must be 9");
  }
  if (!homePage.includes("SAFETY_CANONICAL_TAB_COUNT")) {
    failures.push("HomePage must import SAFETY_CANONICAL_TAB_COUNT");
  }
  if (homePage.includes("count: 6, to: \"/safety\"")) {
    failures.push("HomePage must not hardcode Safety quick-jump count 6");
  }
  if (sidebarConfig.includes('to: "/compliance"') && sidebarConfig.includes('case "safety"')) {
    const safetyBlock = sidebarConfig.split('case "safety"')[1]?.split("case ")[0] ?? "";
    if (safetyBlock.includes('to: "/compliance"')) {
      failures.push("Safety sidebar flyout must not link outside /safety/* to /compliance");
    }
  }
  if (!sidebarConfig.includes('to: "/safety/dot-compliance"')) {
    failures.push("Safety sidebar flyout must include DOT Compliance under /safety/dot-compliance");
  }
  if (!archDesign.includes("27 tabs across 9 groups")) {
    failures.push("ARCHITECTURAL_DESIGN must document 27 tabs across 9 groups");
  }
  const kpiPairs = (foundationKpis.match(/\["[\w-]+", "[\w-]+"\]/g) ?? []).length;
  if (kpiPairs < EXPECTED_TAB_COUNT) {
    failures.push(`foundation-kpis.routes.ts must list ${EXPECTED_TAB_COUNT} canonical tab pairs`);
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail("FAILED");
  }

  console.log("[verify-safety-count-nav-integrity] OK");
}

main();
