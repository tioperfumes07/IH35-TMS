#!/usr/bin/env node
/**
 * Block B21-D8: Driver assignment optimizer — multi-factor score + ranked UI panel.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const paths = {
  service: path.join(ROOT, "apps/backend/src/dispatch/driver-optimizer.service.ts"),
  routeTest: path.join(ROOT, "apps/backend/src/dispatch/__tests__/driver-optimizer.routes.test.ts"),
  routes: path.join(ROOT, "apps/backend/src/dispatch/dispatch-refinements.routes.ts"),
  panel: path.join(ROOT, "apps/frontend/src/components/dispatch/OptimalDriversPanel.tsx"),
  panelTest: path.join(ROOT, "apps/frontend/src/components/dispatch/OptimalDriversPanel.test.tsx"),
  reassignModal: path.join(ROOT, "apps/frontend/src/pages/dispatch/LoadReassignModal.tsx"),
  bookLoadEquipment: path.join(ROOT, "apps/frontend/src/pages/dispatch/components/BookLoadEquipmentSection.tsx"),
  dispatchApi: path.join(ROOT, "apps/frontend/src/api/dispatch.ts"),
  archDesign: path.join(ROOT, "docs/specs/IH35_ARCHITECTURAL_DESIGN.md"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`verify:dispatch-assignment-optimizer FAIL: ${msg}`);
  process.exit(1);
}

function main() {
  const service = read(paths.service);
  const routeTest = read(paths.routeTest);
  const routes = read(paths.routes);
  const panel = read(paths.panel);
  const panelTest = read(paths.panelTest);
  const reassignModal = read(paths.reassignModal);
  const bookLoadEquipment = read(paths.bookLoadEquipment);
  const dispatchApi = read(paths.dispatchApi);
  const archDesign = read(paths.archDesign);
  const failures = [];

  if (!service.includes("DEFAULT_OPTIMIZER_WEIGHTS")) failures.push("optimizer service must export default weights");
  if (!service.includes("rankOptimalDrivers")) failures.push("optimizer service must rank top drivers");
  if (!service.includes("scoreDriverCandidate")) failures.push("optimizer service must score driver candidates");
  if ((routeTest.match(/\bit\(/g) ?? []).length < 5) failures.push("driver-optimizer routes tests must cover at least 5 cases");
  if (!routes.includes("/api/v1/dispatch/loads/:loadId/optimal-drivers")) failures.push("routes must expose optimal-drivers endpoint");
  if (!routes.includes("listOptimalDriversForLoad")) failures.push("routes must call listOptimalDriversForLoad");

  if (!panel.includes("data-testid=\"optimal-drivers-panel\"")) failures.push("OptimalDriversPanel must expose test id");
  if (!panel.includes("Manual override")) failures.push("OptimalDriversPanel must expose manual override flag");
  if (!panel.includes("breakdown")) failures.push("OptimalDriversPanel must show score breakdown");
  if ((panelTest.match(/\bit\(/g) ?? []).length < 3) failures.push("OptimalDriversPanel tests must cover at least 3 cases");

  if (!reassignModal.includes("OptimalDriversPanel")) failures.push("LoadReassignModal must embed OptimalDriversPanel");
  if (!bookLoadEquipment.includes("OptimalDriversPanel")) failures.push("BookLoadEquipmentSection must embed OptimalDriversPanel");
  if (!dispatchApi.includes("getDispatchOptimalDrivers")) failures.push("dispatch API must export getDispatchOptimalDrivers");

  if (!archDesign.includes("verify:dispatch-assignment-optimizer")) {
    failures.push("ARCHITECTURAL_DESIGN must reference verify:dispatch-assignment-optimizer");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail(failures.join("; "));
  }

  console.log("verify:dispatch-assignment-optimizer PASS");
}

main();
