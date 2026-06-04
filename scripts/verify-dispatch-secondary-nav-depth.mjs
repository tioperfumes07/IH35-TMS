#!/usr/bin/env node
/**
 * Block B21-D12: Dispatch page secondary nav — Assignments embed + Settlements quick-link.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const paths = {
  dispatchPage: path.join(ROOT, "apps/frontend/src/pages/Dispatch.tsx"),
  dispatchTest: path.join(ROOT, "apps/frontend/src/pages/__tests__/DispatchSecondaryNav.test.tsx"),
  assignmentHistory: path.join(ROOT, "apps/frontend/src/pages/dispatch/AssignmentHistoryPage.tsx"),
  archDesign: path.join(ROOT, "docs/specs/IH35_ARCHITECTURAL_DESIGN.md"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`verify:dispatch-secondary-nav-depth FAIL: ${msg}`);
  process.exit(1);
}

function main() {
  const dispatchPage = read(paths.dispatchPage);
  const dispatchTest = read(paths.dispatchTest);
  const assignmentHistory = read(paths.assignmentHistory);
  const archDesign = read(paths.archDesign);
  const failures = [];

  if (!assignmentHistory.includes("dispatch-assignment-history-page")) {
    failures.push("D2 AssignmentHistoryPage must exist with test id");
  }
  if (!dispatchPage.includes("AssignmentHistoryPage")) {
    failures.push("Dispatch.tsx must embed AssignmentHistoryPage on assignments tab");
  }
  if (!dispatchPage.includes("dispatch-assignments-embed")) {
    failures.push("Dispatch.tsx must expose assignments embed test id");
  }
  if (!dispatchPage.includes("/driver-finance/settlements")) {
    failures.push("Dispatch.tsx must quick-link settlements to /driver-finance/settlements");
  }
  if (!dispatchPage.includes("dispatch-settlements-link")) {
    failures.push("Dispatch.tsx must expose settlements link test id");
  }
  if (!dispatchPage.includes("dispatch-secondary-nav")) {
    failures.push("Dispatch.tsx must expose secondary nav test id");
  }
  if ((dispatchTest.match(/\bit\(/g) ?? []).length < 3) {
    failures.push("DispatchSecondaryNav tests must cover at least 3 cases");
  }
  if (!archDesign.includes("verify:dispatch-secondary-nav-depth")) {
    failures.push("ARCHITECTURAL_DESIGN must reference verify:dispatch-secondary-nav-depth");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail(failures.join("; "));
  }

  console.log("verify:dispatch-secondary-nav-depth PASS");
}

main();
