#!/usr/bin/env node
/** @matrix-built {"modules":["legal","drivers"],"cols":["driver","connectivity","picker_law"],"leafRe":"^matters\\.(list|create|detail)$|^profiles\\.detail$","task":"THEATER-LEGAL-MATTER-DRIVER-LEAFRE","vertical":"column-wave"} */
import fs from "node:fs";
const LABEL = "verify-legal-matter-driver-linkage";
const files = {
  service: "apps/backend/src/legal/matters.service.ts",
  form: "apps/frontend/src/pages/legal/matters/LegalMatterFormFields.tsx",
  detail: "apps/frontend/src/pages/legal/matters/LegalMatterDetailPage.tsx",
  reverse: "apps/frontend/src/components/legal/LegalMattersReverseSection.tsx",
  driver: "apps/frontend/src/pages/DriverDetail.tsx",
  profile: "apps/frontend/src/pages/drivers/DriverProfilePage.tsx",
  api: "apps/frontend/src/api/legal-matters.ts",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
function audit(s) {
  const failures = [];
  if (!/data-testid="legal-matter-related-driver-picker"[\s\S]{0,500}DriverPickerWithCreate/.test(s.form)) failures.push("matter form must expose canonical driver picker with create");
  if (!/related_driver_id:\s*optionalUuidOrNull\(form\.related_driver_id\)/.test(s.form)) failures.push("form must submit selected driver FK");
  if (!/FROM mdata\.drivers[\s\S]{0,180}operating_company_id = \$2::uuid[\s\S]{0,100}deactivated_at IS NULL[\s\S]{0,80}archived_at IS NULL/.test(s.service)) failures.push("writer must validate active tenant driver");
  if ((s.service.match(/assertDriverInCompany\(client, input\.related_driver_id/g) ?? []).length < 2) failures.push("create and update must validate driver before write");
  if (!/related_driver_id,\s*\n\s*insurance_claim_id/.test(s.service) || !/input\.related_driver_id \?\? null/.test(s.service)) failures.push("create must persist related_driver_id");
  if (!/where\.push\(`m\.related_driver_id = \$\$\{values\.length\}`\)/.test(s.service)) failures.push("list must apply exact driver reverse predicate");
  if ((s.service.match(/related_driver_name/g) ?? []).length < 2 || (s.service.match(/LEFT JOIN mdata\.drivers\s+d\s+ON d\.id\s+= m\.related_driver_id/g) ?? []).length < 2) failures.push("list/detail payloads must resolve driver label");
  if (!/kind="driver"[\s\S]{0,160}matter\.related_driver_id[\s\S]{0,160}related_driver_name/.test(s.detail)) failures.push("matter detail must drill to canonical driver");
  if (!/legalMattersApi\.list\([\s\S]{0,160}\{ related_driver_id: id \}/.test(s.driver)) failures.push("primary driver detail must request exact matter reverse set");
  if (!/legalMattersForDriverQuery\.isError[\s\S]{0,500}title="Couldn't load linked legal matters"[\s\S]{0,500}legalMattersForDriverQuery\.refetch\(\)/.test(s.driver)) failures.push("primary driver detail must disclose failed reverse GET and offer exact retry");
  if (!/!legalMattersForDriverQuery\.isError\s*&&\s*legalMattersListState\.isEmpty/.test(s.driver)) failures.push("primary driver detail must not render failed reverse GET as an empty matter set");
  if (!/filter=\{\{ related_driver_id: id \}\}/.test(s.profile)) failures.push("driver profile must mount exact matter reverse set");
  if (!/\{ related_driver_id: string;/.test(s.reverse) || !/related_driver_id\?: string/.test(s.api)) failures.push("shared reverse/API must retain driver filter");
  return failures;
}
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["picker", "form", /DriverPickerWithCreate/g, "MissingDriverPicker"],
    ["payload", "form", /related_driver_id:\s*optionalUuidOrNull\(form\.related_driver_id\)/, "related_driver_id: null"],
    ["scope", "service", /operating_company_id = \$2::uuid/g, "TRUE"],
    ["active", "service", /deactivated_at IS NULL/g, "TRUE"],
    ["validate", "service", /assertDriverInCompany\(client, input\.related_driver_id/g, "skipDriverCheck(client, input.related_driver_id"],
    ["filter", "service", /where\.push\(`m\.related_driver_id = \$\$\{values\.length\}`\)/, "where.push(`TRUE`)"],
    ["detail", "detail", /kind="driver"/, 'kind="unit"'],
    ["primary reverse", "driver", /\{ related_driver_id: id \}/, "{ unit_id: id }"],
    ["primary reverse error", "driver", /legalMattersForDriverQuery\.isError/, "false"],
    ["primary reverse retry", "driver", /legalMattersForDriverQuery\.refetch\(\)/, "Promise.resolve()"],
    ["primary reverse empty gate", "driver", /!legalMattersForDriverQuery\.isError\s*&&\s*legalMattersListState\.isEmpty/, "legalMattersListState.isEmpty"],
    ["profile reverse", "profile", /filter=\{\{ related_driver_id: id \}\}/, "filter={{ unit_id: id }}"],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const changed = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (changed[key] === source[key] || audit(changed).length === 0) { console.error(`${LABEL} SELFTEST FAIL — ${name}`); process.exit(1); }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`); process.exit(0);
}
const failures = audit(source);
if (failures.length) { console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — driver picker→tenant writer→resolved detail→two exact reverse routes`);
