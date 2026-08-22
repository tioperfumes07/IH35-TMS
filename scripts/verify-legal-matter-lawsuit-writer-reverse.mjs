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
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function audit(s) {
  const failures = [];
  if (!/data-testid="legal-matter-insurance-lawsuit-picker"[\s\S]{0,500}kind="insurance_lawsuit"/.test(s.form)) failures.push("matter form must expose canonical lawsuit picker");
  if (!/insurance_lawsuit_id:\s*optionalUuidOrNull\(form\.insurance_lawsuit_id\)/.test(s.form)) failures.push("form must submit selected lawsuit FK");
  if (!/FROM insurance\.lawsuit[\s\S]{0,160}id = \$1::uuid[\s\S]{0,120}operating_company_id = \$2::uuid/.test(s.service)) failures.push("writer must validate tenant-scoped lawsuit");
  if ((s.service.match(/assertInsuranceLawsuitInCompany\(client, input\.insurance_lawsuit_id/g) ?? []).length < 2) failures.push("create and update must validate lawsuit before write");
  if (!/input\.insurance_lawsuit_id \?\? null/.test(s.service) || !/push\("insurance_lawsuit_id", input\.insurance_lawsuit_id\)/.test(s.service)) failures.push("create and update must persist lawsuit FK");
  if (!/where\.push\(`m\.insurance_lawsuit_id = \$\$\{values\.length\}`\)/.test(s.service)) failures.push("list must apply exact lawsuit reverse predicate");
  if (!/insurance_lawsuit_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(s.routes) || !/insurance_lawsuit_id:\s*parsed\.data\.insurance_lawsuit_id/.test(s.routes)) failures.push("route must forward exact lawsuit filter");
  if (!/insurance_lawsuit_id\?: string/.test(s.api) || !/params\.insurance_lawsuit_id = filters\.insurance_lawsuit_id/.test(s.api)) failures.push("frontend API must forward lawsuit reverse filter");
  if ((s.service.match(/LEFT JOIN insurance\.lawsuit lw ON lw\.id = m\.insurance_lawsuit_id[\s\S]{0,100}lw\.operating_company_id = m\.operating_company_id/g) ?? []).length < 2) failures.push("list/detail labels must be tenant-scoped");
  if (!/kind="lawsuit"[\s\S]{0,180}matter\.insurance_lawsuit_id[\s\S]{0,180}insurance_lawsuit_case_number/.test(s.detail)) failures.push("matter detail must drill to canonical lawsuit");
  if (!/\{ insurance_lawsuit_id: string;/.test(s.reverse)) failures.push("shared reverse section must accept lawsuit FK");
  if (!/filter=\{\{ insurance_lawsuit_id: selectedLawsuitId \}\}[\s\S]{0,120}contextLabel="this lawsuit"/.test(s.lawsuits)) failures.push("lawsuit page must mount exact lawsuit reverse set");
  const companyGuard = s.lawsuits.indexOf("if (!companyId)");
  const columnsHook = s.lawsuits.indexOf("const columns = useMemo");
  if (companyGuard < 0 || columnsHook < 0 || companyGuard < columnsHook) failures.push("lawsuit page must execute hooks before the no-company early return");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["picker", "form", /kind="insurance_lawsuit"/, 'kind="insurance_claim"'],
    ["payload", "form", /insurance_lawsuit_id:\s*optionalUuidOrNull\(form\.insurance_lawsuit_id\)/, "insurance_lawsuit_id: null"],
    ["scope", "service", /(FROM insurance\.lawsuit[\s\S]{0,160})operating_company_id = \$2::uuid/, "$1TRUE"],
    ["validate", "service", /assertInsuranceLawsuitInCompany\(client, input\.insurance_lawsuit_id/g, "skipLawsuitCheck(client, input.insurance_lawsuit_id"],
    ["filter", "service", /where\.push\(`m\.insurance_lawsuit_id = \$\$\{values\.length\}`\)/, "where.push(`TRUE`)"],
    ["route", "routes", /insurance_lawsuit_id:\s*parsed\.data\.insurance_lawsuit_id/, "insurance_lawsuit_id: undefined"],
    ["join", "service", /lw\.operating_company_id = m\.operating_company_id/g, "TRUE"],
    ["detail", "detail", /kind="lawsuit"/, 'kind="claim"'],
    ["reverse", "lawsuits", /filter=\{\{ insurance_lawsuit_id: selectedLawsuitId \}\}/, "filter={{ insurance_claim_id: selectedLawsuitId }}"],
    ["hook order", "lawsuits", /const columns = useMemo/, "if (!companyId) return null;\n  const columns = useMemo"],
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
console.log(`${LABEL} PASS — lawsuit picker→tenant writer→resolved detail→exact lawsuit reverse`);
