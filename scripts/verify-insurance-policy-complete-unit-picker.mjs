#!/usr/bin/env node
import fs from "node:fs";

const files = [
  "apps/frontend/src/components/insurance/PolicyCreateWizard.tsx",
  "apps/frontend/src/components/insurance/PolicyCreateModal.tsx",
];
const mdataFile = "apps/frontend/src/api/mdata.ts";

function findings(read = (file) => fs.readFileSync(file, "utf8")) {
  const out = [];
  const mdata = read(mdataFile);
  if (!mdata.includes('Omit<NonNullable<Parameters<typeof listUnits>[0]>, "limit" | "offset">')) {
    out.push(`${mdataFile}: exhaustive helper params must exclude undefined`);
  }
  if (!mdata.includes('if (params.include_inactive) query.set("include_inactive", "true")')) {
    out.push(`${mdataFile}: exhaustive roster must preserve the inactive filter`);
  }
  for (const file of files) {
    const source = read(file);
    if (!source.includes('import { listAllUnits } from "../../api/mdata";')) out.push(`${file}: must import canonical listAllUnits`);
    if (!source.includes("listAllUnits({")) out.push(`${file}: covered-unit query must exhaust the scoped server range`);
    if (/listUnits\s*\(\s*\{[\s\S]{0,240}?limit:\s*200/.test(source)) out.push(`${file}: silent 200-row unit picker cap remains`);
    if (!source.includes("operating_company_id: operatingCompanyId")) out.push(`${file}: company scope must reach the unit reader`);
    if (!source.includes("selectedUnitIds")) out.push(`${file}: canonical selected ids must remain in the creator`);
  }
  return out;
}

if (process.argv.includes("--selftest")) {
  const allFiles = [...files, mdataFile];
  const base = Object.fromEntries(allFiles.map((file) => [file, fs.readFileSync(file, "utf8")]));
  const mutations = [
    (file, source) => file.endsWith("PolicyCreateWizard.tsx") ? source.replaceAll("listAllUnits", "listUnits") : source,
    (file, source) => file.endsWith("PolicyCreateModal.tsx") ? source.replaceAll("listAllUnits", "listUnits") : source,
    (file, source) => file.endsWith("PolicyCreateWizard.tsx") ? source.replaceAll("operating_company_id: operatingCompanyId", "operating_company_id: undefined") : source,
    (file, source) => file.endsWith("PolicyCreateModal.tsx") ? source.replaceAll("selectedUnitIds", "removedUnitIds") : source,
    (file, source) => file === mdataFile ? source.replace("Omit<NonNullable<Parameters", "Omit<Parameters") : source,
    (file, source) => file === mdataFile ? source.replace('if (params.include_inactive) query.set("include_inactive", "true")', "") : source,
  ];
  for (const mutate of mutations) {
    const got = findings((file) => mutate(file, base[file]));
    if (got.length === 0) throw new Error("planted regression escaped the insurance policy picker guard");
  }
  console.log(`verify-insurance-policy-complete-unit-picker selftest: PASS (${mutations.length}/${mutations.length})`);
  process.exit(0);
}

const got = findings();
if (got.length) {
  console.error(got.join("\n"));
  process.exit(1);
}
console.log("verify-insurance-policy-complete-unit-picker: PASS (2 creators, exhaustive scoped unit reader)");
