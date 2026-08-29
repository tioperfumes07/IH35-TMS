#!/usr/bin/env node
// @matrix-built {"modules":["safety","drivers","dispatch","eld"],"cols":["driver","load","connectivity","reverse_link","qbo_chrome"],"leaves":["hos.list","hos_violations.list","profile.safety_reverse","load.drawer.safety_reverse","violations.list"],"task":"SAFETY-F6870-HOS-VIOLATIONS-SILENT-500-CAP-ALL-SURFACES"}
import fs from "node:fs";

const files = {
  backend: "apps/backend/src/routes/safety/hos-violations.ts",
  api: "apps/frontend/src/api/safetyV64.ts",
  eldApi: "apps/frontend/src/api/eld.ts",
  tab: "apps/frontend/src/pages/safety/tabs/HOSViolationsTab.tsx",
  dashboard: "apps/frontend/src/pages/safety/HoursOfServicePage.tsx",
  driverHub: "apps/frontend/src/components/safety/DriverSafetyReverseSection.tsx",
  driverProfile: "apps/frontend/src/components/safety/DriverHosViolationsReverseSection.tsx",
  load: "apps/frontend/src/components/safety/LoadSafetyReverseSection.tsx",
  eld: "apps/frontend/src/pages/eld/tabs/ViolationsTab.tsx",
  routes: "apps/frontend/src/routes/manifest.tsx",
  driverPage: "apps/frontend/src/pages/drivers/DriverProfilePage.tsx",
  driverDetail: "apps/frontend/src/pages/DriverDetail.tsx",
  loadDrawer: "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx",
};
const live = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function audit(source) {
  const failures = [];
  if (!/limit: z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(200\)\.default\(50\)/.test(source.backend) || !/offset: z\.coerce\.number\(\)\.int\(\)\.min\(0\)\.default\(0\)/.test(source.backend)) failures.push("bounded backend range schema");
  if (!/SELECT COUNT\(\*\)::int AS total_count[\s\S]{0,180}FROM safety\.hos_violations hv[\s\S]{0,180}filters\.map/.test(source.backend)) failures.push("exact shared filter count");
  if (!/LIMIT \$\$\{limitParam\} OFFSET \$\$\{offsetParam\}/.test(source.backend) || !/hos_violations: result\.rows, total_count: result\.total_count/.test(source.backend)) failures.push("bounded rows + exact total response");
  if (!/function listHosViolations\([\s\S]{0,260}limit\?: number; offset\?: number[\s\S]{0,650}total_count: number/.test(source.api)) failures.push("canonical API range contract");
  if (!/fetchEldHosViolations[\s\S]{0,180}limit\?: number; offset\?: number/.test(source.eldApi)) failures.push("ELD API forwards range");
  if (!/offset: \(page - 1\) \* pageSize/.test(source.tab) || !/hos-violations-server-pager/.test(source.tab) || !/hidePager/.test(source.tab)) failures.push("canonical list controlled pager");
  if (!/listHosViolations\(operatingCompanyId, \{ limit: 12, offset: 0 \}\)/.test(source.dashboard) || /violations\.slice\(0, 12\)/.test(source.dashboard)) failures.push("dashboard honest bounded preview");
  if (!/offset: \(hosViolationPage - 1\) \* hosViolationPageSize/.test(source.driverHub) || !/driver-safety-reverse-hos-violations-pager/.test(source.driverHub) || !/count=\{hosViolationTotal\}/.test(source.driverHub)) failures.push("driver hub range + exact total");
  if (!/offset: \(page - 1\) \* pageSize/.test(source.driverProfile) || !/driver-hos-violations-reverse-pager/.test(source.driverProfile)) failures.push("standalone driver reverse pager");
  if (!/offset: \(hosViolationPage - 1\) \* hosViolationPageSize/.test(source.load) || !/load-safety-reverse-hos-violations-pager/.test(source.load)) failures.push("load reverse pager");
  if (!/fetchEldHosViolations\(operatingCompanyId, \{ limit: pageSize, offset: \(page - 1\) \* pageSize \}\)/.test(source.eld) || !/eld-hos-violations-server-pager/.test(source.eld) || !/hidePager/.test(source.eld)) failures.push("ELD list controlled pager");
  if (!/path="hos-violations" element=\{<HOSViolationsTab/.test(source.routes)) failures.push("canonical list route mount");
  if (!/<DriverHosViolationsReverseSection[\s\S]{0,150}driverId=/.test(source.driverPage) || !/<DriverHosViolationsReverseSection[\s\S]{0,150}driverId=/.test(source.driverDetail)) failures.push("both driver reverse mounts");
  if (!/<LoadSafetyReverseSection[\s\S]{0,150}loadId=/.test(source.loadDrawer)) failures.push("load reverse mount");
  if (!/key:\s*"driver_id"[\s\S]{0,120}sortValue:\s*\(row\)\s*=>\s*String\(row\.driver_name/.test(source.tab)) {
    failures.push("HOS Driver column must sortValue driver_name not UUID");
  }
  if (!/key:\s*"related_load_id"[\s\S]{0,120}sortValue:\s*\(row\)\s*=>\s*String\(row\.related_load_number/.test(source.tab)) {
    failures.push("HOS Load column must sortValue related_load_number not UUID");
  }
  return failures;
}

const failures = audit(live);
if (failures.length) {
  console.error(`FAIL verify-safety-hos-violations-range-vertical: ${failures.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["backend", "COUNT(*)::int AS total_count", "COUNT(*) AS hidden_total"],
    ["backend", "LIMIT $${limitParam} OFFSET $${offsetParam}", "LIMIT 500"],
    ["api", "source?: string; limit?: number; offset?: number", "source?: string"],
    ["eldApi", "range: { limit?: number; offset?: number } = {}", "range = {}"],
    ["tab", "hos-violations-server-pager", "hos-violations-summary"],
    ["dashboard", "{ limit: 12, offset: 0 }", "{}"],
    ["driverHub", "count={hosViolationTotal}", "count={hosViolations.length}"],
    ["driverHub", "driver-safety-reverse-hos-violations-pager", "driver-safety-reverse-hos-summary"],
    ["driverProfile", "driver-hos-violations-reverse-pager", "driver-hos-violations-summary"],
    ["load", "load-safety-reverse-hos-violations-pager", "load-safety-reverse-hos-summary"],
    ["eld", "eld-hos-violations-server-pager", "eld-hos-violations-summary"],
    ["routes", "<HOSViolationsTab", "<MissingHOSViolationsTab"],
    ["driverPage", "<DriverHosViolationsReverseSection", "<MissingDriverHosViolationsReverseSection"],
    ["loadDrawer", "<LoadSafetyReverseSection", "<MissingLoadSafetyReverseSection"],
    ["tab", "sortValue: (row) => String(row.driver_name ?? row.driver_id ?? \"\")", ""],
    ["tab", "sortValue: (row) => String(row.related_load_number ?? row.related_load_id ?? \"\")", ""],
  ];
  for (const [key, needle, replacement] of mutations) {
    if (!live[key].includes(needle)) {
      console.error(`FAIL selftest: missing mutation anchor ${key}:${needle}`);
      process.exit(1);
    }
    const mutant = { ...live, [key]: live[key].replace(needle, replacement) };
    if (!audit(mutant).length) {
      console.error(`FAIL selftest: mutation survived ${key}:${needle}`);
      process.exit(1);
    }
  }
  console.log(`PASS verify-safety-hos-violations-range-vertical --selftest (${mutations.length}/${mutations.length} mutations killed)`);
} else {
  console.log("PASS verify-safety-hos-violations-range-vertical (16/16 checks)");
}
