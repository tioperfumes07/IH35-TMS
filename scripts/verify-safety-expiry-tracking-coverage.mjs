#!/usr/bin/env node
/**
 * @matrix-built safety,drivers
 * @matrix-cols driver,connectivity,reverse_link,picker_law
 * Existing claimed verify-step 31. Ratchets background-check create/read/reverse linkage.
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

  if (!/app\.get\("\/api\/v1\/safety\/background-checks", RL_READ/.test(sources.background) ||
      !/bc\.driver_id = \$\$\{values\.length\}::uuid/.test(sources.background)) failures.push("background read must provide company-scoped exact-driver reverse filtering");
  if (!/JOIN mdata\.drivers d[\s\S]*d\.operating_company_id = bc\.operating_company_id/.test(sources.background)) failures.push("background read must resolve labels through an entity-scoped driver join");
  if (!/SELECT id FROM mdata\.drivers WHERE id = \$1::uuid AND operating_company_id = \$2::uuid/.test(sources.background)) failures.push("background writer must validate the driver belongs to the selected company");
  if (!/driver_id: body\.data\.driver_id/.test(sources.background) || !/appendCrudAudit/.test(sources.background)) failures.push("background writer must persist/audit the canonical driver FK");
  if (!/listSafetyBackgroundChecks\(companyId: string, driverId\?: string\)/.test(sources.api) || !/params\.set\("driver_id", driverId\)/.test(sources.api)) failures.push("frontend client must forward the exact reverse driver filter");
  if (!/DriverPickerWithCreate[\s\S]*dataField="background-check-driver"/.test(sources.section)) failures.push("background creator must use the canonical company-scoped driver picker");
  if (!/createSafetyBackgroundCheck\(operatingCompanyId/.test(sources.section) || !/driver_id: selectedDriverId/.test(sources.section)) failures.push("background creator must submit the selected driver FK");
  if (!/listSafetyBackgroundChecks\(operatingCompanyId, driverId\)/.test(sources.section) || !/<EntityLink kind="driver"/.test(sources.section)) failures.push("background list must use exact reverse filtering and canonical driver drill-through");
  if (!/<BackgroundChecksSection operatingCompanyId=\{companyId\}/.test(sources.dot)) failures.push("DOT compliance must mount the all-driver background-check surface");
  if (!/<BackgroundChecksSection operatingCompanyId=\{companyId\} driverId=\{id\}/.test(sources.driver)) failures.push("driver profile must mount exact background-check reverse history");
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
      [REL.background, "d.operating_company_id = bc.operating_company_id", "TRUE"],
      [REL.background, "bc.driver_id = $${values.length}::uuid", "TRUE"],
      [REL.background, "operating_company_id = $2::uuid", "TRUE"],
      [REL.api, 'params.set("driver_id", driverId)', 'params.set("ignored", driverId)'],
      [REL.section, 'dataField="background-check-driver"', 'dataField="free-text-driver"'],
      [REL.dot, "<BackgroundChecksSection", "<MissingBackgroundChecksSection"],
      [REL.driver, '<BackgroundChecksSection operatingCompanyId={companyId} driverId={id}', '<BackgroundChecksSection operatingCompanyId={companyId} driverId={undefined}'],
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
console.log(`verify:safety-expiry-tracking-coverage OK${process.argv.includes("--selftest") ? " — 7/7 mutations killed" : ""}`);
