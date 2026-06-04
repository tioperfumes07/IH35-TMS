#!/usr/bin/env node
/**
 * Block B25: Maintenance create CTA vocabulary (+ Create [Object], not + New/+ Add/+ Create WO).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const paths = {
  partsPage: path.join(ROOT, "apps/frontend/src/pages/maintenance/parts/PartsMasterDataPage.tsx"),
  faultRules: path.join(ROOT, "apps/frontend/src/pages/maintenance/FaultRulesPage.tsx"),
  convertModal: path.join(ROOT, "apps/frontend/src/pages/maintenance/components/ConvertIssueToWOModal.tsx"),
  vehicleActionBar: path.join(ROOT, "apps/frontend/src/components/vehicle-profile/ActionBar.tsx"),
  workOrderNew: path.join(ROOT, "apps/frontend/src/pages/maintenance/WorkOrderNewPage.tsx"),
  manifest: path.join(ROOT, "apps/frontend/src/routes/manifest.tsx"),
  vocabTest: path.join(ROOT, "apps/frontend/src/pages/maintenance/__tests__/maint-create-vocab.test.tsx"),
  archDesign: path.join(ROOT, "docs/specs/IH35_ARCHITECTURAL_DESIGN.md"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`verify:maint-create-vocab FAIL: ${msg}`);
  process.exit(1);
}

function maintenanceCreateLines(src) {
  return src
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.includes("{/*") && !line.includes("ARCHIVE-not-DELETE"));
}

function main() {
  const partsPage = read(paths.partsPage);
  const faultRules = read(paths.faultRules);
  const convertModal = read(paths.convertModal);
  const vehicleActionBar = read(paths.vehicleActionBar);
  const workOrderNew = read(paths.workOrderNew);
  const manifest = read(paths.manifest);
  const vocabTest = read(paths.vocabTest);
  const archDesign = read(paths.archDesign);
  const failures = [];

  if (!partsPage.includes("+ Create Part")) {
    failures.push("PartsMasterDataPage must expose + Create Part");
  }
  if (!partsPage.includes("ARCHIVE-not-DELETE (B25)")) {
    failures.push("PartsMasterDataPage must retain ARCHIVE-not-DELETE (B25) comment");
  }
  if (!faultRules.includes("+ Create Rule")) {
    failures.push("FaultRulesPage must expose + Create Rule");
  }
  if (maintenanceCreateLines(faultRules).some((line) => line.includes("+ Add rule"))) {
    failures.push("FaultRulesPage must not render + Add rule");
  }
  if (!convertModal.includes("+ Create Work Order")) {
    failures.push("ConvertIssueToWOModal must expose + Create Work Order");
  }
  if (maintenanceCreateLines(convertModal).some((line) => />\s*\+ Create WO\s*</.test(line))) {
    failures.push("ConvertIssueToWOModal must not render + Create WO");
  }
  if (!vehicleActionBar.includes("+ Create Work Order")) {
    failures.push("vehicle ActionBar must expose + Create Work Order");
  }
  if (!vehicleActionBar.includes("/maintenance/work-orders/new?unit_id=")) {
    failures.push("vehicle ActionBar must deep-link to /maintenance/work-orders/new?unit_id=");
  }
  if (!workOrderNew.includes("WorkOrderNewPage")) {
    failures.push("WorkOrderNewPage must exist for deep-link handler");
  }
  if (!manifest.includes('path="/maintenance/work-orders/new"')) {
    failures.push("manifest must register /maintenance/work-orders/new route");
  }
  if (!vocabTest.includes("+ Create Part")) {
    failures.push("maint-create-vocab.test must assert + Create Part");
  }
  if (!vocabTest.includes("+ Create Rule")) {
    failures.push("maint-create-vocab.test must assert + Create Rule");
  }
  if (!vocabTest.includes("+ Create Work Order")) {
    failures.push("maint-create-vocab.test must assert + Create Work Order");
  }
  if (!archDesign.includes("verify:maint-create-vocab")) {
    failures.push("ARCHITECTURAL_DESIGN must reference verify:maint-create-vocab");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail(failures.join("; "));
  }

  console.log("verify:maint-create-vocab PASS");
}

main();
