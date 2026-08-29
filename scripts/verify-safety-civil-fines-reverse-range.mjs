#!/usr/bin/env node
// @matrix-built {"modules":["drivers","fleet","dispatch","safety"],"cols":["driver","unit","load","connectivity","reverse_link"],"leaves":["profile.fines_reverse","unit.profile.safety_reverse","load.drawer.safety_reverse","external_fines.list"],"task":"SAFETY-F6867-CIVIL-FINES-REVERSE-FIRST-PAGE-ONLY"}
import fs from "node:fs";

const files = {
  api: "apps/frontend/src/api/safety.ts",
  compactDriver: "apps/frontend/src/components/safety/DriverFinesReverseSection.tsx",
  driverHub: "apps/frontend/src/components/safety/DriverSafetyReverseSection.tsx",
  sharedAssetLoad: "apps/frontend/src/components/safety/CivilFinesReverseBlock.tsx",
  driverProfile: "apps/frontend/src/pages/drivers/DriverProfilePage.tsx",
  driverDetail: "apps/frontend/src/pages/DriverDetail.tsx",
  assetHub: "apps/frontend/src/components/safety/AssetSafetyReverseSection.tsx",
  loadHub: "apps/frontend/src/components/safety/LoadSafetyReverseSection.tsx",
};
const live = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function audit(source) {
  const failures = [];
  if (!source.api.includes('params: { status?: string; subject_type?: "driver" | "company"; subject_driver_id?: string; related_load_id?: string; related_unit_id?: string; limit?: number; offset?: number } = {}') || !/getSafetyFines[\s\S]{0,900}total_count: number/.test(source.api)) failures.push("canonical ranged API + exact total");
  if (!/DriverFinesReverseSection[\s\S]{0,500}civilPage/.test(source.compactDriver) || !/offset: \(civilPage - 1\) \* civilPageSize/.test(source.compactDriver)) failures.push("compact driver range");
  if (!source.compactDriver.includes("const civilTotal") || !source.compactDriver.includes("driver-fines-civil-server-pager") || !/setCivilPage\(1\)[\s\S]{0,180}\}, \[operatingCompanyId, driverId\]\);/.test(source.compactDriver)) failures.push("compact driver total, pager, scope reset");
  if (!/offset: \(civilFinePage - 1\) \* civilFinePageSize/.test(source.driverHub) || !/count=\{civilFineTotal\}/.test(source.driverHub)) failures.push("driver hub range + exact total");
  if (!/driver-safety-reverse-civil-fines-pager/.test(source.driverHub) || !/setCivilFinePage\(1\)/.test(source.driverHub)) failures.push("driver hub pager + scope reset");
  if (!/offset: \(page - 1\) \* pageSize/.test(source.sharedAssetLoad) || !/data\?\.total_count/.test(source.sharedAssetLoad)) failures.push("shared unit/load range + exact total");
  if (!/\$\{related\}-civil-fines-server-pager/.test(source.sharedAssetLoad) || !/setPage\(1\), \[companyId, related, entityId\]/.test(source.sharedAssetLoad)) failures.push("shared unit/load pager + scope reset");
  if (!/<DriverFinesReverseSection[\s\S]{0,180}driverId=/.test(source.driverProfile) || !/<DriverSafetyReverseSection[\s\S]{0,180}driverId=/.test(source.driverProfile)) failures.push("both mounted driver-profile fine consumers");
  if (!/<DriverSafetyReverseSection[\s\S]{0,180}driverId=/.test(source.driverDetail)) failures.push("mounted driver-detail safety hub");
  if (!/isUnit \? <CivilFinesReverseBlock[^>]*related="unit"/.test(source.assetHub)) failures.push("mounted unit reverse consumer");
  if (!/<CivilFinesReverseBlock[\s\S]{0,120}related="load"/.test(source.loadHub)) failures.push("mounted load reverse consumer");
  return failures;
}

const failures = audit(live);
if (failures.length) {
  console.error(`FAIL verify-safety-civil-fines-reverse-range: ${failures.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["api", "related_unit_id?: string; limit?: number; offset?: number", "related_unit_id?: string"],
    ["compactDriver", "offset: (civilPage - 1) * civilPageSize", "offset: 0"],
    ["compactDriver", "driver-fines-civil-server-pager", "driver-fines-civil-summary"],
    ["compactDriver", "setCivilPage(1)", "setCivilPage(2)"],
    ["driverHub", "offset: (civilFinePage - 1) * civilFinePageSize", "offset: 0"],
    ["driverHub", "count={civilFineTotal}", "count={civilFines.length}"],
    ["sharedAssetLoad", "offset: (page - 1) * pageSize", "offset: 0"],
    ["sharedAssetLoad", "${related}-civil-fines-server-pager", "${related}-civil-fines-summary"],
    ["driverProfile", "<DriverFinesReverseSection", "<MissingDriverFinesReverseSection"],
    ["driverDetail", "<DriverSafetyReverseSection", "<MissingDriverSafetyReverseSection"],
    ["assetHub", "<CivilFinesReverseBlock", "<MissingCivilFinesReverseBlock"],
    ["loadHub", "<CivilFinesReverseBlock", "<MissingCivilFinesReverseBlock"],
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
  console.log(`PASS verify-safety-civil-fines-reverse-range --selftest (${mutations.length}/${mutations.length} mutations killed)`);
} else {
  console.log("PASS verify-safety-civil-fines-reverse-range (11/11 checks)");
}
