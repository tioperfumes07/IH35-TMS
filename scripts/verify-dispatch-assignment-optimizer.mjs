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
  refinements: path.join(ROOT, "apps/backend/src/dispatch/dispatch-refinements.service.ts"),
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

export function auditAvailableDriverScope(service) {
  const failures = [];
  const required = [
    [/d\.operating_company_id\s*=\s*\$1::uuid\s+OR\s+EXISTS/i, "available-driver fallback must retain home-company drivers and admit an authorization branch"],
    [/FROM\s+mdata\.driver_company_authorizations\s+available_driver_dca/i, "available-driver fallback must use the canonical authorization table"],
    [/available_driver_dca\.driver_id\s*=\s*d\.id/i, "available-driver authorization must bind the candidate"],
    [/available_driver_dca\.company_id\s*=\s*\$1::uuid/i, "available-driver authorization must bind the selected company"],
    [/available_driver_dca\.is_authorized\s*=\s*true/i, "available-driver authorization must be active"],
    [/available_driver_dca\.deactivated_at\s+IS\s+NULL/i, "available-driver authorization must not be deactivated"],
    [/const scopedLoad = loadPickup\.rows\[0\];\s*if \(!scopedLoad\) throw new Error\("E_LOAD_NOT_FOUND"\);/i, "available-driver fallback must reject a missing/cross-company load before ranking candidates"],
  ];
  for (const [pattern, message] of required) if (!pattern.test(service)) failures.push(message);
  return failures;
}

export function auditPanelRecovery(source) {
  const failures = [];
  if (!/<ListErrorState[\s\S]*?Could not load optimizer rankings\.[\s\S]*?onRetry=\{\(\) => void q\.refetch\(\)\}/.test(source)) failures.push("optimizer GET failure must expose exact-query retry");
  if (!/!q\.isError \|\| driversOverride \? <ul/.test(source)) failures.push("failed optimizer GET must not leave cached rankings selectable");
  return failures;
}

function main() {
  const service = read(paths.service);
  const routeTest = read(paths.routeTest);
  const refinements = read(paths.refinements);
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
  failures.push(...auditAvailableDriverScope(refinements));
  if ((routeTest.match(/\bit\(/g) ?? []).length < 5) failures.push("driver-optimizer routes tests must cover at least 5 cases");
  if (!routes.includes("/api/v1/dispatch/loads/:loadId/optimal-drivers")) failures.push("routes must expose optimal-drivers endpoint");
  if (!routes.includes("listOptimalDriversForLoad")) failures.push("routes must call listOptimalDriversForLoad");
  if (!/\/api\/v1\/dispatch\/available-drivers[\s\S]*E_LOAD_NOT_FOUND[\s\S]*reply\.code\(404\)/.test(routes)) failures.push("available-driver missing load must map to readable 404");

  if (!panel.includes("data-testid=\"optimal-drivers-panel\"")) failures.push("OptimalDriversPanel must expose test id");
  if (!panel.includes("Manual override")) failures.push("OptimalDriversPanel must expose manual override flag");
  if (!panel.includes("breakdown")) failures.push("OptimalDriversPanel must show score breakdown");
  failures.push(...auditPanelRecovery(panel));
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
  const refinements = read(paths.refinements);
  const panel = read(paths.panel);
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
  const availableMutations = [
    ["available home-or-authorization", "d.operating_company_id = $1::uuid\n                OR EXISTS", "d.operating_company_id = $1::uuid\n                AND EXISTS"],
    ["available table", "mdata.driver_company_authorizations available_driver_dca", "mdata.drivers available_driver_dca"],
    ["available driver", "available_driver_dca.driver_id = d.id", "available_driver_dca.driver_id = d.other_id"],
    ["available company", "available_driver_dca.company_id = $1::uuid", "available_driver_dca.company_id = $2::uuid"],
    ["available active", "available_driver_dca.is_authorized = true", "available_driver_dca.is_authorized = false"],
    ["available deactivation", "available_driver_dca.deactivated_at IS NULL", "available_driver_dca.deactivated_at IS NOT NULL"],
    ["available load identity", 'if (!scopedLoad) throw new Error("E_LOAD_NOT_FOUND");', ""],
  ];
  for (const [name, before, after] of availableMutations) {
    const planted = refinements.replace(before, after);
    if (planted === refinements || auditAvailableDriverScope(planted).length === 0) failures.push(`${name} mutation escaped`);
  }
  const panelMutations = [
    ["optimizer retry", "onRetry={() => void q.refetch()}", "onRetry={() => undefined}"],
    ["optimizer stale rows", "!q.isError || driversOverride ? <ul", "true ? <ul"],
  ];
  for (const [name, before, after] of panelMutations) {
    const planted = panel.replace(before, after);
    if (planted === panel || auditPanelRecovery(planted).length === 0) failures.push(`${name} mutation escaped`);
  }
  if (failures.length) fail(failures.join("; "));
  const total = mutations.length + availableMutations.length + panelMutations.length;
  console.log(`verify:dispatch-assignment-optimizer selftest PASS — ${total}/${total} shared-driver scope mutations caught`);
}

if (process.argv.includes("--selftest")) selftest();
else main();
