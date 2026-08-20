#!/usr/bin/env node
/** @matrix-built {"modules":["safety"],"cols":["connectivity"],"leafRe":"^safety\\.panel\\.driver_safety_profile$","task":"VERTICAL-CONNECTIVITY-SAFETY-DRIVER-PROFILE"} */
import fs from "node:fs";

const sources = {
  page: fs.readFileSync("apps/frontend/src/pages/safety/driver-safety/DriverSafetyProfilePage.tsx", "utf8"),
  panel: fs.readFileSync("apps/frontend/src/components/safety/driver-safety/DriverSafetyProfilePanel.tsx", "utf8"),
  api: fs.readFileSync("apps/frontend/src/api/mdata.ts", "utf8"),
  manifest: fs.readFileSync("apps/frontend/src/routes/manifest.tsx", "utf8"),
  backend: fs.readFileSync("apps/backend/src/mdata/driver-aggregate.service.ts", "utf8"),
  matrix: fs.readFileSync("docs/specs/scoreboard/modules/safety.required.json", "utf8"),
};

function failures(candidate) {
  const missing = [
    [candidate.manifest.includes('path="driver-profiles/:driverId"'), "mounted parameterized route"],
    [candidate.page.includes('useParams<{ driverId: string }>()'), "route param consumed"],
    [candidate.page.includes("getDriverSafetyAggregate(driverId, companyId)") && candidate.api.includes("operating_company_id: operatingCompanyId"), "company-scoped aggregate"],
    [candidate.backend.includes("FROM safety.medical_cards") && candidate.backend.includes("medical_card"), "canonical medical source"],
    [candidate.backend.includes("FROM safety.training_records") && candidate.backend.includes("training_records"), "canonical training source"],
    [candidate.page.includes("driver.first_name") && candidate.page.includes("driver.cdl_number") && candidate.page.includes("CDL not on file") && !candidate.page.includes("driver.id.slice") && !candidate.page.includes("DRV-0000"), "real driver identity"],
    [candidate.page.includes("dqMissingCount") && candidate.page.includes("trainingDueCount"), "derived safety counts"],
    [candidate.panel.includes('<EntityLink kind="driver"'), "driver drill-through"],
    [!candidate.page.includes("DriverDocumentUploadField") && !candidate.page.includes("No file selected"), "dead local upload removed"],
  ].filter(([ok]) => !ok).map(([, label]) => label);
  try {
    const leaf = JSON.parse(candidate.matrix).leaves?.find((item) => item.id === "safety.panel.driver_safety_profile");
    if (!leaf?.required?.includes("connectivity")) missing.push("exact safety profile leaf owns connectivity");
  } catch {
    missing.push("safety Required matrix parses");
  }
  return missing;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["manifest", 'path="driver-profiles/:driverId"', 'path="removed"', "mounted parameterized route"],
    ["page", 'useParams<{ driverId: string }>()', "useParams()", "route param consumed"],
    ["page", "getDriverSafetyAggregate(driverId, companyId)", "getDriverSafetyAggregate(driverId, '')", "company-scoped aggregate"],
    ["backend", "FROM safety.medical_cards", "FROM safety.removed_cards", "canonical medical source"],
    ["backend", "FROM safety.training_records", "FROM safety.removed_training", "canonical training source"],
    ["page", "driver.first_name", "driver.id.slice", "real driver identity"],
    ["page", "dqMissingCount", "removedDqCount", "derived safety counts", true],
    ["panel", '<EntityLink kind="driver"', '<span data-kind="driver"', "driver drill-through"],
    ["page", "export default", "DriverDocumentUploadField\nexport default", "dead local upload removed"],
    ["matrix", '"id": "safety.panel.driver_safety_profile"', '"id": "safety.panel.driver_safety_profile.removed"', "exact safety profile leaf owns connectivity"],
  ];
  for (const [key, needle, replacement, expected, replaceEvery] of mutations) {
    const mutant = { ...sources, [key]: replaceEvery ? sources[key].replaceAll(needle, replacement) : sources[key].replace(needle, replacement) };
    if (mutant[key] === sources[key]) throw new Error(`fixture drifted: ${expected}`);
    if (!failures(mutant).includes(expected)) throw new Error(`mutation escaped: ${expected}`);
  }
  console.log(`verify-safety-driver-profile-connectivity SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects caught`);
  process.exit(0);
}

const missing = failures(sources);
if (missing.length) {
  console.error(`verify-safety-driver-profile-connectivity FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-safety-driver-profile-connectivity PASS — exact leaf→route→scoped aggregate→medical/training/DQ+drill");
