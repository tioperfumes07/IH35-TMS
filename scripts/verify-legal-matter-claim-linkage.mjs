#!/usr/bin/env node
/** @matrix-built {"modules":["legal","insurance"],"cols":["connectivity","reverse_link","picker_law"],"leafRe":"^matters\\.(list|create|detail)$|^claims\\.(list|create)$","task":"THEATER-LEGAL-MATTER-CLAIM-LEAFRE","vertical":"column-wave"} */
import fs from "node:fs";
const LABEL = "verify-legal-matter-claim-linkage";
const files = {
  service: "apps/backend/src/legal/matters.service.ts",
  form: "apps/frontend/src/pages/legal/matters/LegalMatterFormFields.tsx",
  detail: "apps/frontend/src/pages/legal/matters/LegalMatterDetailPage.tsx",
  claims: "apps/frontend/src/pages/insurance/ClaimsTab.tsx",
  api: "apps/frontend/src/api/legal-matters.ts",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
function audit(s) {
  const failures = [];
  const tombstoneBinding = (kind, id, name, noun) => new RegExp(`<EntityLinkOrTombstone[\\s\\S]{0,120}kind="${kind}"[\\s\\S]{0,120}id=\\{String\\(matter\\.${id}\\)\\}[\\s\\S]{0,120}name=\\{matter\\.${name}\\}[\\s\\S]{0,80}noun="${noun}"`);
  if (!/data-testid="legal-matter-insurance-claim-picker"[\s\S]{0,500}kind="insurance_claim"/.test(s.form)) failures.push("canonical claim picker missing");
  if (!/insurance_claim_id:\s*optionalUuidOrNull\(form\.insurance_claim_id\)/.test(s.form)) failures.push("claim payload missing");
  if (!/FROM insurance\.claim[\s\S]{0,160}id = \$1::uuid[\s\S]{0,120}operating_company_id = \$2::uuid/.test(s.service)) failures.push("tenant claim validation missing");
  if ((s.service.match(/assertInsuranceClaimInCompany\(client, input\.insurance_claim_id/g) ?? []).length < 2) failures.push("create/update claim validation missing");
  if (!/where\.push\(`m\.insurance_claim_id = \$\$\{values\.length\}`\)/.test(s.service)) failures.push("exact claim reverse predicate missing");
  if ((s.service.match(/LEFT JOIN insurance\.claim ic ON ic\.id = m\.insurance_claim_id[\s\S]{0,100}ic\.operating_company_id = m\.operating_company_id/g) ?? []).length < 2) failures.push("scoped claim labels missing");
  for (const [kind, id, name, noun] of [
    ["driver", "related_driver_id", "related_driver_name", "Driver"],
    ["claim", "insurance_claim_id", "insurance_claim_number", "Claim"],
    ["lawsuit", "insurance_lawsuit_id", "insurance_lawsuit_case_number", "Lawsuit"],
    ["unit", "unit_id", "unit_number", "Unit"],
    ["trailer", "equipment_id", "equipment_number", "Trailer"],
  ]) {
    if (!tombstoneBinding(kind, id, name, noun).test(s.detail)) failures.push(`${kind} detail drill must be tombstone-safe`);
  }
  if (!/insurance_claim_id\?: string/.test(s.api)) failures.push("claim API filter missing");
  if (!/LegalMattersReverseSection[\s\S]{0,180}filter=\{\{ insurance_claim_id: highlightedClaimId \}\}/.test(s.claims)) failures.push("Claims tab exact legal reverse missing");
  return failures;
}
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["picker", "form", /kind="insurance_claim"/, 'kind="insurance_lawsuit"'],
    ["payload", "form", /insurance_claim_id:\s*optionalUuidOrNull\(form\.insurance_claim_id\)/, "insurance_claim_id: null"],
    ["scope", "service", /(FROM insurance\.claim[\s\S]{0,160})operating_company_id = \$2::uuid/, "$1TRUE"],
    ["validate", "service", /assertInsuranceClaimInCompany\(client, input\.insurance_claim_id/g, "skipClaimCheck(client, input.insurance_claim_id"],
    ["filter", "service", /where\.push\(`m\.insurance_claim_id = \$\$\{values\.length\}`\)/, "where.push(`TRUE`)"],
    ["join", "service", /ic\.operating_company_id = m\.operating_company_id/g, "TRUE"],
    ["detail-driver", "detail", /name=\{matter\.related_driver_name\}/, "name={null}"],
    ["detail-claim", "detail", /name=\{matter\.insurance_claim_number\}/, "name={null}"],
    ["detail-lawsuit", "detail", /name=\{matter\.insurance_lawsuit_case_number\}/, "name={null}"],
    ["detail-unit", "detail", /name=\{matter\.unit_number\}/, "name={null}"],
    ["detail-trailer", "detail", /name=\{matter\.equipment_number\}/, "name={null}"],
    ["reverse", "claims", /filter=\{\{ insurance_claim_id: highlightedClaimId \}\}/, "filter={{ unit_id: highlightedClaimId }}"],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const changed = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (changed[key] === source[key] || audit(changed).length === 0) { console.error(`${LABEL} SELFTEST FAIL — ${name}`); process.exit(1); }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`); process.exit(0);
}
const failures = audit(source);
if (failures.length) { console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — claim picker→tenant writer→scoped detail→exact Claims reverse`);
