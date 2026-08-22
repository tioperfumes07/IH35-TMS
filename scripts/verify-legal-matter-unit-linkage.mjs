#!/usr/bin/env node
/** @matrix-built {"modules":["legal","fleet"],"cols":["unit","connectivity","picker_law"],"leafRe":"^matters\\.(list|create|detail)$|^unit\\.profile\\.legal_reverse$","task":"THEATER-LEGAL-MATTER-UNIT-LEAFRE","vertical":"column-wave"} */
import fs from "node:fs";
const LABEL = "verify-legal-matter-unit-linkage";
const files = {
  service: "apps/backend/src/legal/matters.service.ts",
  form: "apps/frontend/src/pages/legal/matters/LegalMatterFormFields.tsx",
  list: "apps/frontend/src/pages/legal/matters/LegalMattersListPage.tsx",
  detail: "apps/frontend/src/pages/legal/matters/LegalMatterDetailPage.tsx",
  reverse: "apps/frontend/src/components/legal/LegalMattersReverseSection.tsx",
  profile: "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
  api: "apps/frontend/src/api/legal-matters.ts",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
function audit(s) {
  const failures = [];
  if (!/data-testid="legal-matter-unit-picker"[\s\S]{0,500}kind="unit"/.test(s.form)) failures.push("matter form must expose canonical unit picker");
  if (!/unit_id:\s*optionalUuidOrNull\(form\.unit_id\)/.test(s.form)) failures.push("form must submit selected unit FK");
  if (!/FROM mdata\.units[\s\S]{0,200}COALESCE\(currently_leased_to_company_id, owner_company_id\) = \$2::uuid[\s\S]{0,100}deactivated_at IS NULL/.test(s.service)) failures.push("writer must validate active lease/owner-scoped unit");
  if ((s.service.match(/assertUnitInCompany\(client, input\.unit_id/g) ?? []).length < 2) failures.push("create and update must validate unit before write");
  if (!/unit_id,\s*\n\s*equipment_id/.test(s.service) || !/input\.unit_id \?\? null/.test(s.service)) failures.push("create must persist unit_id");
  if (!/where\.push\(`m\.unit_id = \$\$\{values\.length\}`\)/.test(s.service)) failures.push("list must apply exact unit reverse predicate");
  if ((s.service.match(/u\.unit_number\s+AS unit_number/g) ?? []).length < 2 || (s.service.match(/LEFT JOIN mdata\.units\s+u\s+ON u\.id\s+= m\.unit_id/g) ?? []).length < 2) failures.push("list/detail payloads must resolve unit label");
  if (!/kind="unit"[\s\S]{0,160}matter\.unit_id[\s\S]{0,160}unit_number/.test(s.detail)) failures.push("matter detail must drill to canonical unit");
  if (!/LegalMattersReverseSection[\s\S]{0,220}filter=\{\{ unit_id: id \}\}/.test(s.profile)) failures.push("vehicle profile must mount exact matter reverse set");
  if (!/\{ unit_id: string;/.test(s.reverse) || !/unit_id\?: string/.test(s.api)) failures.push("shared reverse/API must retain unit filter");
  // LST-F5181 — list reverse must be visible EntityPicker, not URL-only.
  if (
    !/dataTestId="legal-matters-filter-unit"/.test(s.list) ||
    !/kind="unit"/.test(s.list) ||
    !/allowCreate=\{false\}/.test(s.list) ||
    !/searchParams\.get\("unit_id"\)/.test(s.list)
  ) {
    failures.push("matters list must render EntityPicker unit filter (allowCreate=false) synced to ?unit_id=");
  }
  return failures;
}
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["picker", "form", /kind="unit"/, 'kind="trailer"'],
    ["payload", "form", /unit_id:\s*optionalUuidOrNull\(form\.unit_id\)/, "unit_id: null"],
    ["scope", "service", /COALESCE\(currently_leased_to_company_id, owner_company_id\) = \$2::uuid/g, "TRUE"],
    ["active", "service", /deactivated_at IS NULL/g, "TRUE"],
    ["validate", "service", /assertUnitInCompany\(client, input\.unit_id/g, "skipUnitCheck(client, input.unit_id"],
    ["filter", "service", /where\.push\(`m\.unit_id = \$\$\{values\.length\}`\)/, "where.push(`TRUE`)"],
    ["detail", "detail", /kind="unit"/, 'kind="driver"'],
    ["reverse", "profile", /(LegalMattersReverseSection[\s\S]{0,220})filter=\{\{ unit_id: id \}\}/, "$1filter={{ related_driver_id: id }}"],
    ["list-picker", "list", /dataTestId="legal-matters-filter-unit"/, 'dataTestId="broken-filter"'],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const changed = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (changed[key] === source[key] || audit(changed).length === 0) { console.error(`${LABEL} SELFTEST FAIL — ${name}`); process.exit(1); }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`); process.exit(0);
}
const failures = audit(source);
if (failures.length) { console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — unit picker→tenant writer→resolved detail→exact vehicle reverse`);
