#!/usr/bin/env node
import fs from "node:fs";

const files = {
  backend: "apps/backend/src/maintenance/unit-maintenance-history.routes.ts",
  frontend: "apps/frontend/src/components/vehicle-profile/UnitMaintenanceHistorySection.tsx",
  profile: "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
  index: "apps/backend/src/index.ts",
};

export function verify(read = (path) => fs.readFileSync(path, "utf8")) {
  const errors = [];
  const backend = read(files.backend);
  const frontend = read(files.frontend);
  const profile = read(files.profile);
  const index = read(files.index);
  const require = (ok, message) => { if (!ok) errors.push(message); };
  require(backend.includes("/api/v1/maintenance/units/:unitId/work-order-history"), "missing canonical unit history route");
  require(backend.includes("w.operating_company_id = $1::uuid") && backend.includes("w.unit_id = $2::uuid"), "history must scope by company and unit");
  require(backend.includes("linked_work_order_uuid") && backend.includes("gl_account_id"), "history must derive cost and GL links from canonical financial documents");
  require(!backend.includes("w.external_vendor_name"), "history must not read phantom maintenance.work_orders.external_vendor_name");
  require(backend.includes("LEFT JOIN mdata.vendors wv") && backend.includes("COALESCE(b.vendor_name, wv.vendor_name)"), "history must resolve the WO vendor through mdata.vendors");
  require(frontend.includes('data-testid="unit-maintenance-history"'), "missing Maintenance History surface");
  require(frontend.includes('kind="work_order"') && frontend.includes('kind="vendor"') && frontend.includes('kind="journal_entry"'), "missing WO/vendor/GL EntityLinks");
  require(frontend.includes("formatMoneyFromCents") && frontend.includes("ParityTable"), "history must render canonical money and ParityTable");
  require(profile.includes("<UnitMaintenanceHistorySection") && profile.includes("unitId={id}"), "unit profile must mount maintenance history for its unit");
  require(index.includes("registerUnitMaintenanceHistoryRoutes"), "backend route is not mounted");
  return errors;
}

if (process.argv.includes("--selftest")) {
  const baseline = Object.fromEntries(Object.values(files).map((path) => [path, fs.readFileSync(path, "utf8")]));
  const mutations = [
    [files.backend, "/api/v1/maintenance/units/:unitId/work-order-history", "/broken"],
    [files.backend, "w.operating_company_id = $1::uuid", "TRUE"],
    [files.backend, "linked_work_order_uuid", "broken_link"],
    [files.backend, "COALESCE(b.vendor_name, wv.vendor_name)", "w.external_vendor_name"],
    [files.frontend, 'data-testid="unit-maintenance-history"', 'data-testid="broken"'],
    [files.frontend, 'kind="journal_entry"', 'kind="work_order"'],
    [files.profile, "<UnitMaintenanceHistorySection", "<BrokenHistory"],
    [files.index, "registerUnitMaintenanceHistoryRoutes", "missingRoute"],
  ];
  let caught = 0;
  for (const [path, needle, replacement] of mutations) {
    const mutated = { ...baseline, [path]: baseline[path].split(needle).join(replacement) };
    if (verify((p) => mutated[p]).length) caught += 1;
  }
  if (caught !== mutations.length) {
    console.error(`FAIL planted mutations caught ${caught}/${mutations.length}`);
    process.exit(1);
  }
  console.log(`PASS planted mutations caught ${caught}/${mutations.length}`);
  process.exit(0);
}
const errors = verify();
if (errors.length) { errors.forEach((error) => console.error(`FAIL ${error}`)); process.exit(1); }
console.log("PASS REG-049 unit Maintenance History linkage contract");
