#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const pageFile = path.join(repoRoot, "apps/frontend/src/pages/maintenance/FleetTablePage.tsx");
const optionsFile = path.join(repoRoot, "apps/frontend/src/components/fleet/fleetTypeFilter.ts");
const apiFile = path.join(repoRoot, "apps/frontend/src/api/mdata.ts");
const pageSource = fs.readFileSync(pageFile, "utf8");
const optionsSource = fs.readFileSync(optionsFile, "utf8");
const apiSource = fs.readFileSync(apiFile, "utf8");

const requiredOptions = [
  "All",
  "Truck",
  "Tractor",
  "Reefer",
  "DryVan",
  "Flatbed",
  "Stepdeck",
  "Lowboy",
  "Tanker",
  "Custom",
];

function audit(page, options, api = apiSource) {
  const failures = [];
  const need = (condition, label) => { if (!condition) failures.push(label); };
  for (const option of requiredOptions) need(options.includes(`label: "${option}"`), `option ${option}`);
  need(options.includes('searchParams.get("type")'), "URL parser reads type");
  need(options.includes("isFleetTypeFilterValue(raw) ? raw : \"\""), "URL parser rejects unknown types");
  need(page.includes("const typeFilter = parseFleetTypeFilter(searchParams)"), "page parses URL type");
  need(/type: typeFilter \|\| undefined/.test(page), "complete rows query forwards type");
  need(/if \(params\.type\) query\.set\("type", params\.type\)/.test(api), "canonical API serializes type");
  need(page.includes('typeFilter || "all"'), "query key varies by type");
  need((page.match(/await listAllUnits\(/g) || []).length >= 2, "total and filtered queries use canonical complete reader");
  need(/await listAllUnits\(\{[\s\S]{0,220}type: typeFilter \|\| undefined/.test(page), "rows query uses canonical complete reader with type");
  need(page.includes("applied: { activeOnly, typeFilter }"), "staged filters seed applied type");
  need(page.includes("setTypeFilter(next.typeFilter)"), "Apply commits staged type");
  need(page.includes('id="fleet-type-filter"'), "type select mounted");
  need(page.includes("value={staged.draft.typeFilter}"), "select reads staged type");
  need(page.includes("typeFilter: event.target.value"), "select writes staged type");
  need(page.includes("FLEET_TYPE_FILTER_OPTIONS.map"), "select renders canonical options");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = requiredOptions.map((option) => ({
    page: pageSource,
    options: optionsSource.replace(`label: "${option}"`, `label: "Missing ${option}"`),
  }));
  mutations.push(
    { page: pageSource, options: optionsSource.replace('searchParams.get("type")', 'searchParams.get("kind")') },
    { page: pageSource, options: optionsSource.replace('isFleetTypeFilterValue(raw) ? raw : ""', 'raw as FleetTypeFilterValue') },
    { page: pageSource.replace("const typeFilter = parseFleetTypeFilter(searchParams)", 'const typeFilter = ""'), options: optionsSource },
    { page: pageSource.replace("type: typeFilter || undefined", "type: undefined"), options: optionsSource },
    { page: pageSource.replace('typeFilter || "all"', '"all"'), options: optionsSource },
    { page: pageSource.replaceAll("await listAllUnits({", "await listUnits({"), options: optionsSource },
    { page: pageSource.replace("applied: { activeOnly, typeFilter }", 'applied: { activeOnly, typeFilter: "" }'), options: optionsSource },
    { page: pageSource.replace("setTypeFilter(next.typeFilter)", 'setTypeFilter("")'), options: optionsSource },
    { page: pageSource.replace('id="fleet-type-filter"', 'id="missing-filter"'), options: optionsSource },
    { page: pageSource.replace("value={staged.draft.typeFilter}", 'value=""'), options: optionsSource },
    { page: pageSource.replace("typeFilter: event.target.value", 'typeFilter: ""'), options: optionsSource },
    { page: pageSource.replace("FLEET_TYPE_FILTER_OPTIONS.map", "[].map"), options: optionsSource },
  );
  mutations.push({ page: pageSource, options: optionsSource, api: apiSource.replaceAll('query.set("type", params.type)', 'query.set("status", params.type)') });
  const escaped = mutations
    .map(({ page, options, api }, index) => audit(page, options, api ?? apiSource).length === 0 ? index + 1 : null)
    .filter(Boolean);
  if (audit(pageSource, optionsSource).length || escaped.length) {
    console.error(`[verify-fleet-type-filter-dropdown] selftest FAIL — mutations ${escaped.join(", ")} of ${mutations.length} escaped`);
    process.exit(1);
  }
  console.log(`[verify-fleet-type-filter-dropdown] selftest PASS — ${mutations.length}/${mutations.length} catalog/parser/API/query/Apply/control defects detected`);
  process.exit(0);
}

const failures = audit(pageSource, optionsSource);
if (failures.length) {
  console.error(`[verify-fleet-type-filter-dropdown] FAIL — ${failures.join(", ")}`);
  process.exit(1);
}

console.log("[verify-fleet-type-filter-dropdown] PASS — canonical type catalog is URL/API/query/Apply/control wired");
