#!/usr/bin/env node
/** @matrix-built {"modules":["drivers"],"cols":["driver","connectivity","reverse_link","picker_law"],"leafRe":"^profiles\\.detail$|^profiles\\.drawer\\.(background_check|medical_card)$","task":"THEATER-DRIVER-COMPLIANCE-HISTORY-LEAFRE","vertical":"column-wave"} */
import fs from "node:fs";

const LABEL = "verify-driver-compliance-history-double-route";
const files = {
  background: "apps/frontend/src/components/safety/BackgroundChecksSection.tsx",
  medical: "apps/frontend/src/components/safety/MedicalCardsHistorySection.tsx",
  backgroundRoute: "apps/backend/src/safety/background-checks.routes.ts",
  medicalRoute: "apps/backend/src/safety/medical-cards.routes.ts",
  detail: "apps/frontend/src/pages/DriverDetail.tsx",
  profile: "apps/frontend/src/pages/drivers/DriverProfilePage.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function audit(s) {
  const failures = [];
  if (!/DriverPickerWithCreate/.test(s.background) || !/driver_id: input\.driverId/.test(s.background)) failures.push("background-check creator driver FK missing");
  if (!/DriverPickerWithCreate/.test(s.medical) || !/driver_id: input\.driverId/.test(s.medical)) failures.push("medical-card creator driver FK missing");
  if (!/bc\.driver_id = \$\$\{values\.length\}::uuid/.test(s.backgroundRoute) || !/(?<!_)dca\.company_id = \$2::uuid[\s\S]{0,160}(?<!_)dca\.is_authorized = true[\s\S]{0,160}(?<!_)dca\.deactivated_at IS NULL/.test(s.backgroundRoute) || !/label_dca\.company_id = bc\.operating_company_id[\s\S]{0,160}label_dca\.is_authorized = true/.test(s.backgroundRoute)) failures.push("background-check exact scoped authorized reverse missing");
  if (!/if \(!result\.found\) return reply\.code\(404\)\.send\(\{ error: "mdata_driver_not_found" \}\)/.test(s.backgroundRoute)) failures.push("background-check invalid parent must not render as true empty");
  if (!/mc\.driver_id = \$\$\{values\.length\}::uuid/.test(s.medicalRoute) || !/d\.operating_company_id = mc\.operating_company_id/.test(s.medicalRoute)) failures.push("medical-card exact scoped reverse missing");
  if (!/listSafetyBackgroundChecks\(operatingCompanyId, driverId, \{ limit: pageSize, offset: \(page - 1\) \* pageSize \}\)/.test(s.background) || !/query\.isError/.test(s.background) || !/query\.refetch\(\)/.test(s.background) || !/No background checks found/.test(s.background)) failures.push("background-check reverse states missing");
  if (!/listSafetyMedicalCards\(operatingCompanyId, driverId, \{ limit: pageSize, offset: \(page - 1\) \* pageSize \}\)/.test(s.medical) || !/query\.isError/.test(s.medical) || !/query\.refetch\(\)/.test(s.medical) || !/No medical cards found/.test(s.medical)) failures.push("medical-card reverse states missing");
  for (const [route, text] of [["detail", s.detail], ["profile", s.profile]]) {
    if (!/MedicalCardsHistorySection[\s\S]{0,140}driverId=\{id\}/.test(text)) failures.push(`${route} medical-card mount missing`);
    if (!/BackgroundChecksSection[\s\S]{0,140}driverId=\{id\}/.test(text)) failures.push(`${route} background-check mount missing`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["background-picker", "background", /DriverPickerWithCreate/g, "MissingDriverPicker"],
    ["background-payload", "background", /driver_id: input\.driverId/, "driver_id: ''"],
    ["medical-picker", "medical", /DriverPickerWithCreate/g, "MissingDriverPicker"],
    ["medical-payload", "medical", /driver_id: input\.driverId/, "driver_id: ''"],
    ["background-filter", "backgroundRoute", /bc\.driver_id = \$\$\{values\.length\}::uuid/, "TRUE"],
    ["background-parent-auth", "backgroundRoute", /(?<!_)dca\.is_authorized = true/, "TRUE"],
    ["background-label-auth", "backgroundRoute", /label_dca\.is_authorized = true/, "TRUE"],
    ["background-parent-404", "backgroundRoute", /if \(!result\.found\) return reply\.code\(404\)/, "if (false) return reply.code(404)"],
    ["medical-filter", "medicalRoute", /mc\.driver_id = \$\$\{values\.length\}::uuid/, "TRUE"],
    ["background-paged-reverse", "background", /listSafetyBackgroundChecks\(operatingCompanyId, driverId,/, "listSafetyBackgroundChecks(operatingCompanyId, undefined,"],
    ["background-error-state", "background", /query\.isError/g, "false"],
    ["background-empty-state", "background", /No background checks found\./, "Background checks unavailable."],
    ["medical-paged-reverse", "medical", /listSafetyMedicalCards\(operatingCompanyId, driverId,/, "listSafetyMedicalCards(operatingCompanyId, undefined,"],
    ["medical-error-state", "medical", /query\.isError/g, "false"],
    ["medical-empty-state", "medical", /No medical cards found\./, "Medical cards unavailable."],
    ["detail-medical", "detail", /MedicalCardsHistorySection/g, "MissingMedicalCards"],
    ["detail-background", "detail", /BackgroundChecksSection/g, "MissingBackgroundChecks"],
    ["profile-medical", "profile", /MedicalCardsHistorySection/g, "MissingMedicalCards"],
    ["profile-background", "profile", /BackgroundChecksSection/g, "MissingBackgroundChecks"],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const candidate = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (candidate[key] === source[key] || audit(candidate).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — driver compliance creators/FKs→exact scoped reverse→both canonical driver routes`);
