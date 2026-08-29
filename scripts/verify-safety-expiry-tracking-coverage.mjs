#!/usr/bin/env node
/**
 * @matrix-built safety,drivers
 * @matrix-cols driver,connectivity,reverse_link,picker_law
 * Existing claimed verify-step 31. Ratchets background-check and medical-card create/read/reverse linkage.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.VERIFY_SAFETY_EXPIRY_ROOT ?? process.cwd();
const REL = {
  profile: "apps/backend/src/safety/driver-profile.routes.ts",
  dq: "apps/backend/src/safety/driver-qualification.routes.ts",
  medical: "apps/backend/src/safety/medical-cards.routes.ts",
  background: "apps/backend/src/safety/background-checks.routes.ts",
  training: "apps/backend/src/safety/training-records.routes.ts",
  api: "apps/frontend/src/api/safety.ts",
  section: "apps/frontend/src/components/safety/BackgroundChecksSection.tsx",
  medicalSection: "apps/frontend/src/components/safety/MedicalCardsHistorySection.tsx",
  dot: "apps/frontend/src/pages/safety/tabs/DOTComplianceTab.tsx",
  driver: "apps/frontend/src/pages/drivers/DriverProfilePage.tsx",
};

function read(root, rel) {
  const target = path.resolve(root, rel);
  return fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null;
}

export function collectProblems(root = ROOT) {
  const sources = Object.fromEntries(Object.entries(REL).map(([key, rel]) => [key, read(root, rel)]));
  const failures = Object.entries(sources).filter(([, source]) => source === null).map(([key]) => `missing ${REL[key]}`);
  if (failures.length) return failures;
  const expirySource = [sources.profile, sources.dq, sources.medical, sources.background, sources.training].join("\n");
  for (const [id, pattern] of [
    ["pill-function", /function expiryPill\(/],
    ["dq-expiry-column", /expiry_date/],
    ["medical-expiry-column", /medical_days_to_expiry|expiry_date/],
    ["background-expiry-column", /background_checks[\s\S]*expiry_date/],
    ["training-expiry-column", /training_records[\s\S]*expiry_date/],
  ]) if (!pattern.test(expirySource)) failures.push(`missing_pattern:${id}`);
  if (/driver_safety_profiles[\s\S]{0,500}?\.catch\s*\(/.test(sources.profile)) failures.push("driver profile read must propagate SQL failures instead of converting them to not-found");

  if (!/app\.get\("\/api\/v1\/safety\/background-checks", RL_READ/.test(sources.background) ||
      !/bc\.driver_id = \$\$\{values\.length\}::uuid/.test(sources.background)) failures.push("background read must provide company-scoped exact-driver reverse filtering");
  if (!/JOIN mdata\.drivers d[\s\S]*d\.operating_company_id = bc\.operating_company_id/.test(sources.background)) failures.push("background read must resolve labels through an entity-scoped driver join");
  if (!/background_check_create_driver_dca\.company_id = \$2::uuid[\s\S]{0,180}background_check_create_driver_dca\.is_authorized = true[\s\S]{0,180}background_check_create_driver_dca\.deactivated_at IS NULL/.test(sources.background)) failures.push("background writer must validate owned or actively authorized selected-company driver");
  if (!/driver_id: body\.data\.driver_id/.test(sources.background) || !/appendCrudAudit/.test(sources.background)) failures.push("background writer must persist/audit the canonical driver FK");
  if (!/listSafetyBackgroundChecks\(companyId: string, driverId\?: string, range:/.test(sources.api) || !/params\.set\("driver_id", driverId\)/.test(sources.api)) failures.push("frontend client must forward the exact reverse driver filter with server range support");
  if (!/DriverPickerWithCreate[\s\S]*dataField="background-check-driver"/.test(sources.section)) failures.push("background creator must use the canonical company-scoped driver picker");
  if (!/createSafetyBackgroundCheck\(input\.companyId/.test(sources.section) || !/driver_id: input\.driverId/.test(sources.section)) failures.push("background creator must submit the snapshotted selected-company driver FK");
  if (!/listSafetyBackgroundChecks\(operatingCompanyId, driverId,\s*\{\s*limit:\s*pageSize,\s*offset:/.test(sources.section) || !/<EntityLink kind="driver"/.test(sources.section)) failures.push("background list must use exact reverse filtering, server range, and canonical driver drill-through");
  if (!/<BackgroundChecksSection operatingCompanyId=\{companyId\}/.test(sources.dot)) failures.push("DOT compliance must mount the all-driver background-check surface");
  if (!/<BackgroundChecksSection operatingCompanyId=\{companyId\} driverId=\{id\}/.test(sources.driver)) failures.push("driver profile must mount exact background-check reverse history");
  if (!/app\.get\("\/api\/v1\/safety\/medical-cards", RL_READ/.test(sources.medical) ||
      !/mc\.driver_id = \$\$\{values\.length\}::uuid/.test(sources.medical)) failures.push("medical-card read must provide company-scoped exact-driver reverse filtering");
  if (!/JOIN mdata\.drivers d[\s\S]*d\.operating_company_id = mc\.operating_company_id/.test(sources.medical)) failures.push("medical-card read must resolve labels through an entity-scoped driver join");
  if (!/label_dca\.company_id = mc\.operating_company_id[\s\S]{0,180}label_dca\.is_authorized = true[\s\S]{0,180}label_dca\.deactivated_at IS NULL/.test(sources.medical)) failures.push("medical-card list must resolve authorized shared-driver labels");
  if ((sources.medical.match(/(?<!_)dca\.company_id = \$2::uuid/g) ?? []).length !== 2 ||
      (sources.medical.match(/(?<!_)dca\.is_authorized = true/g) ?? []).length !== 2 ||
      (sources.medical.match(/(?<!_)dca\.deactivated_at IS NULL/g) ?? []).length !== 2) failures.push("both medical-card exact reads must validate owned or authorized driver parent");
  if (!/if \(!result\.found\) return reply\.code\(404\)\.send\(\{ error: "mdata_driver_not_found" \}\)/.test(sources.medical)) failures.push("medical-card exact list filter must distinguish invalid parent from true empty cards");
  if (!/medical_card_create_driver_dca\.company_id = \$2::uuid[\s\S]{0,180}medical_card_create_driver_dca\.is_authorized = true[\s\S]{0,180}medical_card_create_driver_dca\.deactivated_at IS NULL/.test(sources.medical)) failures.push("medical-card writer must validate owned or actively authorized selected-company driver");
  if (!/listSafetyMedicalCards\(companyId: string, driverId\?: string, range:/.test(sources.api) || !/params\.set\("driver_id", driverId\)/.test(sources.api)) failures.push("frontend client must expose the exact medical-card reverse filter with server range support");
  if (!/DriverPickerWithCreate[\s\S]*dataField="medical-card-driver"/.test(sources.medicalSection)) failures.push("medical-card creator must use the canonical company-scoped driver picker");
  if (!/createSafetyMedicalCard\(input\.companyId[\s\S]*driver_id: input\.driverId/.test(sources.medicalSection)) failures.push("medical-card creator must submit the snapshotted selected-company driver FK");
  if (!/listSafetyMedicalCards\(operatingCompanyId, driverId,\s*\{\s*limit:\s*pageSize,\s*offset:/.test(sources.medicalSection) || !/<EntityLink kind="driver"/.test(sources.medicalSection)) failures.push("medical-card list must use exact reverse filtering, server range, and canonical driver drill-through");
  if (!/<MedicalCardsHistorySection operatingCompanyId=\{companyId\}/.test(sources.dot)) failures.push("DOT compliance must mount the all-driver medical-card surface");
  if (!/<MedicalCardsHistorySection operatingCompanyId=\{companyId\} driverId=\{id\}/.test(sources.driver)) failures.push("driver profile must mount exact medical-card reverse history");
  if (!/app\.post\("\/api\/v1\/safety\/training-records", RL_WRITE/.test(sources.training)) failures.push("training-record writer must be explicitly rate-limited");
  if (!/training_create_driver_dca\.company_id = \$2::uuid[\s\S]{0,180}training_create_driver_dca\.is_authorized = true[\s\S]{0,180}training_create_driver_dca\.deactivated_at IS NULL/.test(sources.training) ||
      !/driver_not_in_operating_company/.test(sources.training)) failures.push("training-record writer must reject drivers outside the selected company");
  if (!/app\.post\("\/api\/v1\/safety\/driver-qualification\/items", RL_WRITE/.test(sources.dq)) failures.push("DQF writer must be explicitly rate-limited");
  if (!/qualification_create_driver_dca\.company_id = \$2::uuid[\s\S]{0,180}qualification_create_driver_dca\.is_authorized = true[\s\S]{0,180}qualification_create_driver_dca\.deactivated_at IS NULL/.test(sources.dq) ||
      !/driver_not_in_operating_company/.test(sources.dq)) failures.push("DQF writer must reject drivers outside the selected company");
  return failures;
}

function selftest() {
  const baseline = collectProblems();
  if (baseline.length) return baseline;
  const temp = fs.mkdtempSync(path.join(process.cwd(), ".tmp-safety-background-link-"));
  try {
    for (const rel of Object.values(REL)) {
      const target = path.join(temp, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(process.cwd(), rel), target);
    }
    const mutations = [
      [REL.profile, "        );\n      const row = profileRes.rows", "        ).catch(() => ({ rows: [] }));\n      const row = profileRes.rows"],
      [REL.background, "d.operating_company_id = bc.operating_company_id", "TRUE"],
      [REL.background, "bc.driver_id = $${values.length}::uuid", "TRUE"],
      [REL.background, "background_check_create_driver_dca.is_authorized = true", "background_check_create_driver_dca.is_authorized = false"],
      [REL.api, "listSafetyBackgroundChecks(companyId: string, driverId?: string, range:", "listSafetyBackgroundChecks(companyId: string, range:"],
      [REL.section, 'dataField="background-check-driver"', 'dataField="free-text-driver"'],
      [REL.dot, "<BackgroundChecksSection", "<MissingBackgroundChecksSection"],
      [REL.driver, '<BackgroundChecksSection operatingCompanyId={companyId} driverId={id}', '<BackgroundChecksSection operatingCompanyId={companyId} driverId={undefined}'],
      [REL.medical, "d.operating_company_id = mc.operating_company_id", "TRUE"],
      [REL.medical, "label_dca.is_authorized = true", "TRUE"],
      [REL.medical, "dca.is_authorized = true", "TRUE"],
      [REL.medical, "medical_card_create_driver_dca.is_authorized = true", "medical_card_create_driver_dca.is_authorized = false"],
      [REL.medical, 'if (!result.found) return reply.code(404)', 'if (false) return reply.code(404)'],
      [REL.medical, "mc.driver_id = $${values.length}::uuid", "TRUE"],
      [REL.medical, 'app.get("/api/v1/safety/medical-cards", RL_READ', 'app.get("/api/v1/safety/medical-cards", {}'],
      [REL.api, "listSafetyMedicalCards(companyId: string, driverId?: string, range:", "listSafetyMedicalCards(companyId: string, range:"],
      [REL.medicalSection, 'dataField="medical-card-driver"', 'dataField="free-text-driver"'],
      [REL.dot, "<MedicalCardsHistorySection", "<MissingMedicalCardsHistorySection"],
      [REL.driver, '<MedicalCardsHistorySection operatingCompanyId={companyId} driverId={id}', '<MedicalCardsHistorySection operatingCompanyId={companyId} driverId={undefined}'],
      [REL.training, 'app.post("/api/v1/safety/training-records", RL_WRITE', 'app.post("/api/v1/safety/training-records", {}'],
      [REL.training, "training_create_driver_dca.is_authorized = true", "training_create_driver_dca.is_authorized = false"],
      [REL.dq, 'app.post("/api/v1/safety/driver-qualification/items", RL_WRITE', 'app.post("/api/v1/safety/driver-qualification/items", {}'],
      [REL.dq, "qualification_create_driver_dca.is_authorized = true", "qualification_create_driver_dca.is_authorized = false"],
    ];
    for (const [rel, before, after] of mutations) {
      const target = path.join(temp, rel);
      const original = fs.readFileSync(target, "utf8");
      if (!original.includes(before)) return [`selftest fixture drift: ${rel} missing ${before}`];
      fs.writeFileSync(target, original.replace(before, after));
      if (!collectProblems(temp).length) return [`mutation survived: ${rel} ${before}`];
      fs.writeFileSync(target, original);
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
  return [];
}

const failures = process.argv.includes("--selftest") ? selftest() : collectProblems();
if (failures.length) {
  console.error("verify:safety-expiry-tracking-coverage FAILED");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log(`verify:safety-expiry-tracking-coverage OK${process.argv.includes("--selftest") ? " — 23/23 mutations killed" : ""}`);
