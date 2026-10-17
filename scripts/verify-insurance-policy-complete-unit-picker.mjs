#!/usr/bin/env node
import fs from "node:fs";

const files = [
  "apps/frontend/src/components/insurance/PolicyCreateWizard.tsx",
  "apps/frontend/src/components/insurance/PolicyCreateModal.tsx",
];
const mdataFile = "apps/frontend/src/api/mdata.ts";
const registryFile = "apps/frontend/src/components/parity/entityPickerRegistry.ts";
// REPOINTED (LEAD ROUND 443.187). b9c69cc37c "FINDING: INS-F7494 canonicalize policy covered-unit
// picker (#18140)" replaced the creators' hand-rolled listAllUnits({ include: "trailers" }) roster
// with the company-scoped canonical EntityPicker kind="unit": insurance.policy_unit persists
// mdata.assets/units identities and resolveMdataAssetId cannot resolve mdata.equipment trailers, so
// the trailer union was a write-time defect. verify-entity-picker-trailer-kind-sweep now PLANTS
// `listAllUnits({ include: "trailers" })` in these two files as a regression. The rule this guard
// owns is unchanged — every creator reads the COMPLETE, company-scoped unit roster (server search,
// no silent 200-row cap) and submits canonical selected ids — it is asserted on the current reader.

function findings(read = (file) => fs.readFileSync(file, "utf8")) {
  const out = [];
  const mdata = read(mdataFile);
  if (!mdata.includes('Omit<NonNullable<Parameters<typeof listUnits>[0]>, "limit" | "offset">')) {
    out.push(`${mdataFile}: exhaustive helper params must exclude undefined`);
  }
  if (!mdata.includes('if (params.include_inactive) query.set("include_inactive", "true")')) {
    out.push(`${mdataFile}: exhaustive roster must preserve the inactive filter`);
  }
  const registry = read(registryFile);
  const unitEntry = registry.match(/\n  unit: \{[\s\S]*?\n  \},/)?.[0] ?? "";
  if (!unitEntry) out.push(`${registryFile}: canonical unit picker entry missing`);
  if (!/serverSearch:\s*true/.test(unitEntry)) out.push(`${registryFile}: unit picker must search server-side (complete roster, not a first page)`);
  if (!/operating_company_id:\s*operatingCompanyId/.test(unitEntry)) out.push(`${registryFile}: company scope must reach the unit reader`);
  if (!/search:\s*opts\?\.search/.test(unitEntry)) out.push(`${registryFile}: unit picker must forward the search to the server`);
  if (/include:\s*"trailers"/.test(unitEntry.replace(/\/\/[^\n]*/g, ""))) out.push(`${registryFile}: unit picker must read exactly mdata.units (no trailer union)`);
  for (const file of files) {
    const source = read(file);
    if (!/<EntityPicker\s+kind="unit"\s+operatingCompanyId=\{operatingCompanyId\}/.test(source)) out.push(`${file}: covered-unit picker must be the company-scoped canonical EntityPicker kind="unit"`);
    if (/listUnits\s*\(\s*\{[\s\S]{0,240}?limit:\s*200/.test(source)) out.push(`${file}: silent 200-row unit picker cap remains`);
    if (/include:\s*"trailers"/.test(source)) out.push(`${file}: covered units persist mdata units/assets — a trailer union is a write-time defect (INS-F7494)`);
    if (!source.includes("selectedUnits.map((unit) => unit.value)")) out.push(`${file}: canonical selected ids must remain in the creator`);
  }
  return out;
}

if (process.argv.includes("--selftest")) {
  const allFiles = [...files, mdataFile, registryFile];
  const base = Object.fromEntries(allFiles.map((file) => [file, fs.readFileSync(file, "utf8")]));
  const mutations = [
    (file, source) => file.endsWith("PolicyCreateWizard.tsx") ? source.replace('kind="unit"', 'kind="vendor"') : source,
    (file, source) => file.endsWith("PolicyCreateModal.tsx") ? source.replace(/(<EntityPicker\s+kind="unit"\s+)operatingCompanyId=\{operatingCompanyId\}/, "$1operatingCompanyId={undefined}") : source,
    (file, source) => file.endsWith("PolicyCreateWizard.tsx") ? `${source}\nlistUnits({ operating_company_id: operatingCompanyId, limit: 200 })` : source,
    (file, source) => file.endsWith("PolicyCreateModal.tsx") ? source.replaceAll("selectedUnits.map((unit) => unit.value)", "[]") : source,
    (file, source) => file.endsWith("PolicyCreateModal.tsx") ? `${source}\nlistAllUnits({ include: "trailers" })` : source,
    (file, source) => file === registryFile ? source.replace(/(\n  unit: \{[\s\S]*?)serverSearch: true/, "$1serverSearch: false") : source,
    (file, source) => file === registryFile ? source.replace(/(\n  unit: \{[\s\S]*?)limit: 500,/, '$1limit: 500, include: "trailers",') : source,
    (file, source) => file === mdataFile ? source.replace("Omit<NonNullable<Parameters", "Omit<Parameters") : source,
    (file, source) => file === mdataFile ? source.replace('if (params.include_inactive) query.set("include_inactive", "true")', "") : source,
  ];
  for (const mutate of mutations) {
    const got = findings((file) => mutate(file, base[file]));
    if (got.length === 0) throw new Error(`planted regression #${mutations.indexOf(mutate) + 1} escaped the insurance policy picker guard`);
  }
  console.log(`verify-insurance-policy-complete-unit-picker selftest: PASS (${mutations.length}/${mutations.length})`);
  process.exit(0);
}

const got = findings();
if (got.length) {
  console.error(got.join("\n"));
  process.exit(1);
}
console.log("verify-insurance-policy-complete-unit-picker: PASS (2 creators, canonical company-scoped server-search unit picker)");
