#!/usr/bin/env node
/** @matrix-built {"modules":["safety"],"cols":["connectivity"],"leafRe":"^safety\\.panel\\.driver_safety_profile$","task":"VERTICAL-CONNECTIVITY-SAFETY-DRIVER-PROFILE"} */
import fs from "node:fs";

const sources = {
  page: fs.readFileSync("apps/frontend/src/pages/safety/driver-safety/DriverSafetyProfilePage.tsx", "utf8"),
  panel: fs.readFileSync("apps/frontend/src/components/safety/driver-safety/DriverSafetyProfilePanel.tsx", "utf8"),
  profile: fs.readFileSync("apps/frontend/src/pages/drivers/DriverProfilePage.tsx", "utf8"),
  hosSection: fs.readFileSync("apps/frontend/src/components/driver-profile/HOSStatusSection.tsx", "utf8"),
  performanceSection: fs.readFileSync("apps/frontend/src/components/driver-profile/PerformanceScorecardSection.tsx", "utf8"),
  medicalSection: fs.readFileSync("apps/frontend/src/components/driver-profile/MedicalCardSection.tsx", "utf8"),
  drugSection: fs.readFileSync("apps/frontend/src/components/driver-profile/DrugProgramSection.tsx", "utf8"),
  trainingSection: fs.readFileSync("apps/frontend/src/components/driver-profile/TrainingRecordsSection.tsx", "utf8"),
  w8benSection: fs.readFileSync("apps/frontend/src/components/driver-profile/W8BenSection.tsx", "utf8"),
  api: fs.readFileSync("apps/frontend/src/api/mdata.ts", "utf8"),
  manifest: fs.readFileSync("apps/frontend/src/routes/manifest.tsx", "utf8"),
  backend: fs.readFileSync("apps/backend/src/mdata/driver-aggregate.service.ts", "utf8"),
  routes: fs.readFileSync("apps/backend/src/mdata/drivers.routes.ts", "utf8"),
  pdf: fs.readFileSync("apps/backend/src/mdata/driver-pdf-export.routes.ts", "utf8"),
  w8benRoutes: fs.readFileSync("apps/backend/src/mdata/driver-w8ben.routes.ts", "utf8"),
  matrix: fs.readFileSync("docs/specs/scoreboard/modules/safety.required.json", "utf8"),
};

function failures(candidate) {
  const missing = [
    [candidate.manifest.includes('path="driver-profiles/:driverId"'), "mounted parameterized route"],
    [candidate.page.includes('useParams<{ driverId: string }>()'), "route param consumed"],
    [candidate.page.includes("getDriverSafetyAggregate(driverId, companyId)") && candidate.api.includes("operating_company_id: operatingCompanyId"), "company-scoped aggregate"],
    [candidate.backend.includes("FROM safety.medical_cards") && candidate.backend.includes("medical_card"), "canonical medical source"],
    [candidate.backend.includes("FROM safety.training_records") && candidate.backend.includes("training_records"), "canonical training source"],
    [/catch \{\s*hos = null;\s*hos_unavailable = true;\s*\}/.test(candidate.backend) && candidate.profile.includes("unavailable={aggregate.hos_unavailable === true}"), "HOS failures remain distinct from absent data"],
    [/catch \{\s*performance_scorecard = null;\s*performance_scorecard_unavailable = true;\s*\}/.test(candidate.backend) && candidate.profile.includes("unavailable={aggregate.performance_scorecard_unavailable === true}"), "performance failures remain distinct from absent data"],
    [candidate.hosSection.includes("ELD / HOS data could not be loaded.") && candidate.hosSection.includes("ELD / HOS data not available for this driver."), "HOS failure and empty messages remain honest"],
    [candidate.performanceSection.includes("Performance data could not be loaded.") && candidate.performanceSection.includes("No Samsara safety data for the last 30 days."), "performance failure and empty messages remain honest"],
    [candidate.profile.includes("Failed to load driver layovers.") && candidate.profile.includes("onClick={() => void refetch()}"), "layover GET failure is visible and retryable"],
    [candidate.profile.includes("profileQ.isError") && candidate.profile.includes("Couldn't load driver profile") && candidate.profile.includes("onRetry={() => void profileQ.refetch()}"), "profile GET failure cannot masquerade as driver not found"],
    [candidate.profile.includes("itemsQ.isError") && candidate.profile.includes("Couldn't load DQF summary") && candidate.profile.includes("onRetry={() => void itemsQ.refetch()}"), "DQF summary GET failure cannot masquerade as zero compliance counts"],
    [candidate.backend.includes("medical_card_unavailable = medicalRes.unavailable") && candidate.profile.includes("unavailable={aggregate.medical_card_unavailable === true}"), "medical-card query failure remains distinct"],
    [candidate.backend.includes("drug_program_unavailable = drugRes.unavailable || poolRes.unavailable") && candidate.profile.includes("unavailable={aggregate.drug_program_unavailable === true}"), "drug and pool query failures remain distinct"],
    [candidate.backend.includes("training_records_unavailable = trainingRes.unavailable") && candidate.profile.includes("unavailable={aggregate.training_records_unavailable === true}"), "training query failure remains distinct"],
    [candidate.backend.includes("w8ben_unavailable = w8benRes.unavailable") && candidate.profile.includes("unavailable={aggregate.w8ben_unavailable === true}"), "W-8BEN query failure remains distinct"],
    [candidate.medicalSection.includes("Medical card data could not be loaded."), "medical-card failure is visible"],
    [candidate.drugSection.includes("Drug program data could not be loaded."), "drug-program failure is visible"],
    [candidate.trainingSection.includes("Training records could not be loaded."), "training failure is visible"],
    [candidate.w8benSection.includes("W-8BEN data could not be loaded.") && candidate.w8benSection.includes("!unavailable && onFile"), "W-8BEN failure cannot masquerade as missing"],
    [!candidate.backend.includes('"driver_agg_docs"') && !candidate.backend.includes("documents: documentsRes.rows"), "unused duplicate documents query removed"],
    [/resolveOperatingCompanyId\([\s\S]{0,180}authUser\.uuid,[\s\S]{0,120}parsedAggregateQuery\.data\.operating_company_id[\s\S]{0,180}buildDriverAggregate\(client, parsedParams\.data\.id, scopedCompanyId\)/.test(candidate.routes), "aggregate membership scope"],
    [/resolveOperatingCompanyId\([\s\S]{0,180}authUser\.uuid,[\s\S]{0,120}query\.data\.operating_company_id[\s\S]{0,180}buildDriverAggregate\(client, params\.data\.id, scopedCompanyId\)/.test(candidate.pdf), "PDF membership scope"],
    [/async function driverOnCompanyRoster\([\s\S]*FROM mdata\.drivers d[\s\S]*d\.operating_company_id = \$2::uuid[\s\S]*dca\.company_id = \$2::uuid[\s\S]*dca\.is_authorized = true[\s\S]*return Boolean\(driver\.rows\[0\]\)/.test(candidate.w8benRoutes), "W-8BEN canonical roster predicate"],
    [/app\.get\("\/api\/v1\/mdata\/drivers\/:id\/w8ben"[\s\S]*driverOnCompanyRoster\(client, params\.data\.id, query\.data\.operating_company_id\)[\s\S]*FROM safety\.driver_w8ben[\s\S]*if \(rows === null\) return reply\.code\(404\)\.send\(\{ error: "mdata_driver_not_found" \}\)/.test(candidate.w8benRoutes), "W-8BEN reverse GET parent scope and honest 404"],
    [/app\.post\("\/api\/v1\/mdata\/drivers\/:id\/w8ben"[\s\S]*driverOnCompanyRoster\(client, params\.data\.id, query\.data\.operating_company_id\)[\s\S]*INSERT INTO safety\.driver_w8ben[\s\S]*if \(!row\) return reply\.code\(404\)\.send\(\{ error: "mdata_driver_not_found" \}\)/.test(candidate.w8benRoutes), "W-8BEN forward create parent scope and honest 404"],
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
    ["backend", "hos_unavailable = true", "hos_unavailable = false", "HOS failures remain distinct from absent data"],
    ["backend", "performance_scorecard_unavailable = true", "performance_scorecard_unavailable = false", "performance failures remain distinct from absent data"],
    ["hosSection", "ELD / HOS data could not be loaded.", "ELD / HOS data not available for this driver.", "HOS failure and empty messages remain honest"],
    ["performanceSection", "Performance data could not be loaded.", "No Samsara safety data for the last 30 days.", "performance failure and empty messages remain honest"],
    ["profile", "Failed to load driver layovers.", "No layovers.", "layover GET failure is visible and retryable"],
    ["profile", "Couldn't load driver profile", "Driver not found", "profile GET failure cannot masquerade as driver not found"],
    ["profile", "Couldn't load DQF summary", "DQF summary unavailable", "DQF summary GET failure cannot masquerade as zero compliance counts"],
    ["backend", "medical_card_unavailable = medicalRes.unavailable", "medical_card_unavailable = false", "medical-card query failure remains distinct"],
    ["backend", "drug_program_unavailable = drugRes.unavailable || poolRes.unavailable", "drug_program_unavailable = false", "drug and pool query failures remain distinct"],
    ["backend", "training_records_unavailable = trainingRes.unavailable", "training_records_unavailable = false", "training query failure remains distinct"],
    ["backend", "w8ben_unavailable = w8benRes.unavailable", "w8ben_unavailable = false", "W-8BEN query failure remains distinct"],
    ["medicalSection", "Medical card data could not be loaded.", "Medical card unavailable.", "medical-card failure is visible"],
    ["drugSection", "Drug program data could not be loaded.", "Drug data unavailable.", "drug-program failure is visible"],
    ["trainingSection", "Training records could not be loaded.", "Training unavailable.", "training failure is visible"],
    ["w8benSection", "!unavailable && onFile", "onFile", "W-8BEN failure cannot masquerade as missing"],
    ["backend", "const w8benRes =", 'const documentsRes = await withSavepoint(client, "driver_agg_docs", async () => ({ rows: [] }), { rows: [] });\n  const w8benRes =', "unused duplicate documents query removed"],
    ["routes", "parsedAggregateQuery.data.operating_company_id", "undefined", "aggregate membership scope"],
    ["pdf", "query.data.operating_company_id", "undefined", "PDF membership scope"],
    ["w8benRoutes", "d.operating_company_id = $2::uuid", "TRUE", "W-8BEN canonical roster predicate"],
    ["w8benRoutes", 'return reply.code(404).send({ error: "mdata_driver_not_found" })', "return { rows: [] }", "W-8BEN reverse GET parent scope and honest 404"],
    ["w8benRoutes", "if (!(await driverOnCompanyRoster(client, params.data.id, query.data.operating_company_id))) return null;", "", "W-8BEN reverse GET parent scope and honest 404"],
    ["w8benRoutes", "if (!(await driverOnCompanyRoster(client, params.data.id, query.data.operating_company_id))) return null;", "", "W-8BEN forward create parent scope and honest 404", true],
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
