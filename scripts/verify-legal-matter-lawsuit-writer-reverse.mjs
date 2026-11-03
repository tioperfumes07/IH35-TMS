#!/usr/bin/env node
/** @matrix-built {"modules":["legal","insurance"],"cols":["connectivity","picker_law"],"leafRe":"^matters\\.(list|create|detail)$|^lawsuits\\.(list|create)$","task":"THEATER-LEGAL-MATTER-LAWSUIT-LEAFRE","vertical":"column-wave"} */
import fs from "node:fs";

const LABEL = "verify-legal-matter-lawsuit-writer-reverse";
const files = {
  service: "apps/backend/src/legal/matters.service.ts",
  routes: "apps/backend/src/legal/matters.routes.ts",
  api: "apps/frontend/src/api/legal-matters.ts",
  form: "apps/frontend/src/pages/legal/matters/LegalMatterFormFields.tsx",
  detail: "apps/frontend/src/pages/legal/matters/LegalMatterDetailPage.tsx",
  reverse: "apps/frontend/src/components/legal/LegalMattersReverseSection.tsx",
  lawsuits: "apps/frontend/src/pages/insurance/LawsuitsTab.tsx",
  legalLawsuits: "apps/frontend/src/pages/legal/matters/LegalMattersListPage.tsx",
  picker: "apps/frontend/src/components/parity/entityPickerRegistry.ts",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function audit(s) {
  const failures = [];
  if (!/data-testid="legal-matter-insurance-lawsuit-picker"[\s\S]{0,500}kind="insurance_lawsuit"/.test(s.form)) {
    failures.push("matter form must expose canonical lawsuit picker");
  }
  if (!/insurance_lawsuit_id:\s*optionalUuidOrNull\(form\.insurance_lawsuit_id\)/.test(s.form)) {
    failures.push("form must submit selected lawsuit FK");
  }
  // ENG-60 — picker + writer + schema agree on legal.matters type=lawsuit (not insurance.lawsuit).
  if (!/insurance_lawsuit:[\s\S]{0,200}readTable:\s*"legal\.matters"/.test(s.picker)) {
    failures.push("entityPickerRegistry.insurance_lawsuit must read legal.matters (ENG-60)");
  }
  if (!/FROM legal\.matters[\s\S]{0,200}id = \$1::uuid[\s\S]{0,160}operating_company_id = \$2::uuid[\s\S]{0,120}type = 'lawsuit'/.test(s.service)) {
    failures.push("writer must validate tenant-scoped legal.matters type=lawsuit (ENG-60)");
  }
  if (/FROM insurance\.lawsuit[\s\S]{0,160}id = \$1::uuid/.test(s.service)) {
    failures.push("writer must not validate against retired insurance.lawsuit (ENG-60)");
  }
  if ((s.service.match(/assertInsuranceLawsuitInCompany\(client, input\.insurance_lawsuit_id/g) ?? []).length < 2) {
    failures.push("create and update must validate lawsuit before write");
  }
  if (!/input\.insurance_lawsuit_id \?\? null/.test(s.service) || !/push\("insurance_lawsuit_id", input\.insurance_lawsuit_id\)/.test(s.service)) {
    failures.push("create and update must persist lawsuit FK");
  }
  if (!/where\.push\(`m\.insurance_lawsuit_id = \$\$\{values\.length\}`\)/.test(s.service)) {
    failures.push("list must apply exact lawsuit reverse predicate");
  }
  if (!/insurance_lawsuit_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(s.routes) || !/insurance_lawsuit_id:\s*parsed\.data\.insurance_lawsuit_id/.test(s.routes)) {
    failures.push("route must forward exact lawsuit filter");
  }
  if (!/insurance_lawsuit_id\?: string/.test(s.api) || !/params\.insurance_lawsuit_id = filters\.insurance_lawsuit_id/.test(s.api)) {
    failures.push("frontend API must forward lawsuit reverse filter");
  }
  if (
    (s.service.match(
      /LEFT JOIN legal\.matters lw ON lw\.id = m\.insurance_lawsuit_id[\s\S]{0,160}lw\.operating_company_id = m\.operating_company_id[\s\S]{0,80}lw\.type = 'lawsuit'/g,
    ) ?? []).length < 2
  ) {
    failures.push("list/detail labels must join legal.matters type=lawsuit (ENG-60)");
  }
  if (/LEFT JOIN insurance\.lawsuit lw ON/.test(s.service)) {
    failures.push("list/detail must not join retired insurance.lawsuit (ENG-60)");
  }
  if (!/kind="lawsuit"[\s\S]{0,180}matter\.insurance_lawsuit_id[\s\S]{0,180}insurance_lawsuit_case_number/.test(s.detail)) {
    failures.push("matter detail must drill to canonical lawsuit");
  }
  if (!/\{ insurance_lawsuit_id: string;/.test(s.reverse)) {
    failures.push("shared reverse section must accept lawsuit FK");
  }
  // ENG-60: insurance LawsuitsTab redirects; LegalMattersListPage honors ?insurance_lawsuit_id=.
  if (!/Navigate to=\{`\/legal\/lawsuits\$\{search\}`\}/.test(s.lawsuits)) {
    failures.push("insurance LawsuitsTab must Navigate to /legal/lawsuits (ENG-60)");
  }
  if (!/insurance_lawsuit_id:\s*insuranceLawsuitId/.test(s.legalLawsuits)) {
    failures.push("LegalMattersListPage must forward insurance_lawsuit_id filter (ENG-60 canonical board)");
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["picker", "form", /kind="insurance_lawsuit"/, 'kind="insurance_claim"'],
    ["payload", "form", /insurance_lawsuit_id:\s*optionalUuidOrNull\(form\.insurance_lawsuit_id\)/, "insurance_lawsuit_id: null"],
    ["scope", "service", /(FROM legal\.matters[\s\S]{0,200})operating_company_id = \$2::uuid/, "$1TRUE /* stripped */"],
    ["type gate", "service", /type = 'lawsuit'/g, "type = 'other'"],
    ["legacy join", "service", /LEFT JOIN legal\.matters lw ON/g, "LEFT JOIN insurance.lawsuit lw ON"],
    ["validate", "service", /assertInsuranceLawsuitInCompany\(client, input\.insurance_lawsuit_id/g, "skipLawsuitCheck(client, input.insurance_lawsuit_id"],
    ["filter", "service", /where\.push\(`m\.insurance_lawsuit_id = \$\$\{values\.length\}`\)/, "where.push(`TRUE`)"],
    ["route", "routes", /insurance_lawsuit_id:\s*parsed\.data\.insurance_lawsuit_id/, "insurance_lawsuit_id: undefined"],
    ["join scope", "service", /lw\.operating_company_id = m\.operating_company_id/g, "TRUE"],
    ["detail", "detail", /kind="lawsuit"/, 'kind="claim"'],
    ["redirect", "lawsuits", /\/legal\/lawsuits/, "/insurance/lawsuits"],
    ["legal filter", "legalLawsuits", /insurance_lawsuit_id:\s*insuranceLawsuitId/, "insurance_lawsuit_id: undefined"],
    ["picker registry", "picker", /readTable:\s*"legal\.matters"/, 'readTable: "insurance.lawsuit"'],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const changed = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (changed[key] === source[key] || audit(changed).length === 0) {
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
console.log(`${LABEL} PASS — lawsuit picker→tenant writer→resolved detail→exact lawsuit reverse (ENG-60 legal.matters)`);
