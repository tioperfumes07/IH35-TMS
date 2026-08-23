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

export function auditSharedDriverScope(service) {
  const failures = [];
  const required = [
    [/d\.operating_company_id\s*=\s*\$1::uuid\s+OR\s+EXISTS/i, "optimizer must retain home-company drivers and admit an authorization branch"],
    [/FROM\s+mdata\.driver_company_authorizations\s+optimizer_driver_dca/i, "optimizer must use the canonical driver authorization table"],
    [/optimizer_driver_dca\.driver_id\s*=\s*d\.id/i, "authorization must bind the ranked driver"],
    [/optimizer_driver_dca\.company_id\s*=\s*\$1::uuid/i, "authorization must bind the selected company"],
    [/optimizer_driver_dca\.is_authorized\s*=\s*true/i, "authorization must be active"],
    [/optimizer_driver_dca\.deactivated_at\s+IS\s+NULL/i, "deactivated authorizations must be rejected"],
  ];
  for (const [pattern, message] of required) if (!pattern.test(service)) failures.push(message);
  return failures;
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
  failures.push(...auditSharedDriverScope(service));
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

function selftest() {
  const service = read(paths.service);
  const mutations = [
    ["home-or-authorization", "OR EXISTS", "AND EXISTS"],
    ["authorization table", "mdata.driver_company_authorizations optimizer_driver_dca", "mdata.drivers optimizer_driver_dca"],
    ["driver binding", "optimizer_driver_dca.driver_id = d.id", "optimizer_driver_dca.driver_id = d.other_id"],
    ["company binding", "optimizer_driver_dca.company_id = $1::uuid", "optimizer_driver_dca.company_id = $2::uuid"],
    ["authorized flag", "optimizer_driver_dca.is_authorized = true", "optimizer_driver_dca.is_authorized = false"],
    ["deactivation", "optimizer_driver_dca.deactivated_at IS NULL", "optimizer_driver_dca.deactivated_at IS NOT NULL"],
  ];
  const failures = [];
  for (const [name, before, after] of mutations) {
    const planted = service.replace(before, after);
    if (planted === service || auditSharedDriverScope(planted).length === 0) failures.push(`${name} mutation escaped`);
  }
  if (failures.length) fail(failures.join("; "));
  console.log(`verify:dispatch-assignment-optimizer selftest PASS — ${mutations.length}/${mutations.length} shared-driver scope mutations caught`);
}

if (process.argv.includes("--selftest")) selftest();
else main();
