#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const LABEL = "verify-expense-nonidentity-surfaces-honest";
const FORBIDDEN = {
  compliance: ["property_tax.list", "property_tax.detail", "form2290", "hop.fuel_compliance"],
  home: ["jump.fuel"],
  insurance: ["policies.create", "lawsuits.create"],
  legal: ["matters.create"],
};
const SURFACES = [
  "apps/frontend/src/pages/compliance/PropertyTaxRenditionPage.tsx",
  "apps/frontend/src/pages/compliance/Form2290Filings.tsx",
  "apps/frontend/src/pages/fuel/components/FuelKpiRow.tsx",
  "apps/frontend/src/components/insurance/PolicyCreateModal.tsx",
  "apps/frontend/src/components/insurance/PolicyCreateWizard.tsx",
  "apps/frontend/src/components/insurance/LawsuitCreateModal.tsx",
  "apps/frontend/src/pages/legal/matters/LegalMatterNewPage.tsx",
  "apps/frontend/src/pages/legal/matters/LegalMatterFormFields.tsx",
];

export function audit(docs, surfaces) {
  const failures = [];
  for (const [module, ids] of Object.entries(FORBIDDEN)) {
    const leaves = new Map(docs[module].leaves.map((leaf) => [leaf.id, leaf]));
    for (const id of ids) {
      if (!leaves.has(id)) failures.push(`${module}.${id}: leaf missing`);
      else if ((leaves.get(id).required || []).includes("expense")) failures.push(`${module}.${id}: false expense Required`);
    }
  }
  for (const [file, source] of Object.entries(surfaces)) {
    if (/kind=["']expense["']|\bexpense_id\b|accounting\.expenses/.test(source)) {
      failures.push(`${file}: gained expense identity; re-scope Required and guard the path`);
    }
  }
  return failures;
}

const docs = Object.fromEntries(Object.keys(FORBIDDEN).map((module) => [module, JSON.parse(fs.readFileSync(path.join(ROOT, `docs/specs/scoreboard/modules/${module}.required.json`), "utf8"))]));
const surfaces = Object.fromEntries(SURFACES.map((file) => [file, fs.readFileSync(path.join(ROOT, file), "utf8")]));

if (process.argv.includes("--selftest")) {
  let mutations = 0;
  for (const [module, ids] of Object.entries(FORBIDDEN)) for (const id of ids) {
    const mutated = structuredClone(docs);
    mutated[module].leaves.find((leaf) => leaf.id === id).required.push("expense");
    if (!audit(mutated, surfaces).some((failure) => failure.includes(`${module}.${id}`))) {
      console.error(`${LABEL} SELFTEST FAIL — ${module}.${id} mutation escaped`);
      process.exit(1);
    }
    mutations++;
  }
  const mutatedSurfaces = { ...surfaces, [SURFACES[0]]: '<EntityLink kind="expense" id={expense_id} />' };
  if (!audit(docs, mutatedSurfaces).some((failure) => failure.includes(SURFACES[0]))) {
    console.error(`${LABEL} SELFTEST FAIL — source mutation escaped`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations + 1} mutations detected`);
  process.exit(0);
}

const failures = audit(docs, surfaces);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — eight GL/navigation/create surfaces remain expense-identity honest`);
