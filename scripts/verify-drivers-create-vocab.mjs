#!/usr/bin/env node
/**
 * Block A24-4: Drivers hub header CTA vocabulary (+ Create Driver, not + Driver).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const paths = {
  driversPage: path.join(ROOT, "apps/frontend/src/pages/Drivers.tsx"),
  tabsTest: path.join(ROOT, "apps/frontend/src/pages/drivers/__tests__/DriversPage.tabs.test.tsx"),
  createTest: path.join(ROOT, "apps/frontend/src/pages/drivers/__tests__/DriversPage.create.test.tsx"),
  archDesign: path.join(ROOT, "docs/specs/IH35_ARCHITECTURAL_DESIGN.md"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`[verify-drivers-create-vocab] ${msg}`);
  process.exit(1);
}

function main() {
  const driversPage = read(paths.driversPage);
  const tabsTest = read(paths.tabsTest);
  const createTest = read(paths.createTest);
  const archDesign = read(paths.archDesign);
  const failures = [];

  if (!driversPage.includes("+ Create Driver")) {
    failures.push("DriversPage header CTA must say + Create Driver");
  }
  if (!driversPage.includes("ARCHIVE-not-DELETE (A24-4)")) {
    failures.push("DriversPage must retain ARCHIVE-not-DELETE (A24-4) comment");
  }
  const nonCommentLines = driversPage
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.includes("{/*"));
  if (nonCommentLines.some((line) => />\s*\+ Driver\s*</.test(line) || />\s*\+ Driver\s*$/.test(line.trim()))) {
    failures.push("DriversPage must not render non-canonical '+ Driver' button label");
  }
  if (!tabsTest.includes('name: "+ Create Driver"')) {
    failures.push("DriversPage.tabs.test must assert + Create Driver button");
  }
  if (!createTest.includes("\\+ Create Driver")) {
    failures.push("DriversPage.create.test must click + Create Driver");
  }
  if (!archDesign.includes("verify:drivers-create-vocab")) {
    failures.push("ARCHITECTURAL_DESIGN must reference verify:drivers-create-vocab");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail("FAILED");
  }

  console.log("[verify-drivers-create-vocab] OK");
}

main();
