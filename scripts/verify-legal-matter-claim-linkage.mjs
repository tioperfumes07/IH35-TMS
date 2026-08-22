#!/usr/bin/env node
/** @matrix-built {"modules":["legal"],"cols":["reverse_link"],"leaves":["matters.list","matters.create","matters.detail"],"task":"LEGAL-F5897-MATTERS-REVERSE-EXACT","vertical":"class-sweep"} */
import fs from "node:fs";
const LABEL = "verify-legal-matter-claim-linkage";
const files = {
  service: "apps/backend/src/legal/matters.service.ts",
  form: "apps/frontend/src/pages/legal/matters/LegalMatterFormFields.tsx",
  detail: "apps/frontend/src/pages/legal/matters/LegalMatterDetailPage.tsx",
  claims: "apps/frontend/src/pages/insurance/ClaimsTab.tsx",
  api: "apps/frontend/src/api/legal-matters.ts",
  matrix: "docs/specs/scoreboard/modules/legal.required.json",
  feed: "docs/specs/scoreboard/wire-sprint-built.json",
  self: "scripts/verify-legal-matter-claim-linkage.mjs",
};
const HEADER = '/** @matrix-built {"modules":["legal"],"cols":["reverse_link"],"leaves":["matters.list","matters.create","matters.detail"],"task":"LEGAL-F5897-MATTERS-REVERSE-EXACT","vertical":"class-sweep"} */';
const DUPLICATE_GUARDS = [
  "scripts/verify-steps/917-verify-legal-reverse-drill-fleet-insurance.mjs",
  "scripts/verify-legal-matter-trailer-linkage.mjs",
  "scripts/verify-legal-matter-driver-linkage.mjs",
  "scripts/verify-legal-matter-unit-linkage.mjs",
  "scripts/verify-legal-matter-lawsuit-writer-reverse.mjs",
  "scripts/verify-nonmoney-exact-entity-nouns.mjs",
];
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
  let matrix;
  try { matrix = JSON.parse(s.matrix); } catch (error) { failures.push(`Legal matrix parse: ${error.message}`); }
  for (const [id, route] of [["matters.list", "/legal/matters"], ["matters.create", "/legal/matters/new"], ["matters.detail", "/legal/matters/:id"]]) {
    const leaf = matrix?.leaves?.find((candidate) => candidate.id === id);
    if (!leaf?.required?.includes("reverse_link")) failures.push(`${id} must require reverse_link`);
    if (leaf?.route_hint !== route) failures.push(`${id} must name mounted route ${route}`);
  }
  if (!s.self.split('import fs from "node:fs";')[0].includes(HEADER)) failures.push("exact three-leaf header missing");
  try {
    const entries = JSON.parse(s.feed).entries ?? [];
    if (entries.some((entry) => entry.guard === files.self)) failures.push("manual feed duplicates exact ownership");
    for (const guard of DUPLICATE_GUARDS) {
      if (entries.some((entry) => entry.guard === guard && entry.cols?.includes("reverse_link"))) failures.push(`${guard} retains duplicate matter reverse ownership`);
    }
  } catch (error) { failures.push(`feed parse: ${error.message}`); }
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
  for (const [id, route] of [["matters.list", "/legal/matters"], ["matters.create", "/legal/matters/new"], ["matters.detail", "/legal/matters/:id"]]) {
    const idToken = `"id": "${id}"`, start = source.matrix.indexOf(idToken), end = source.matrix.indexOf("\n    {", start + idToken.length), block = source.matrix.slice(start, end < 0 ? source.matrix.length : end);
    for (const [token, replacement] of [[idToken, `"id": "${id}.broken"`], ['"reverse_link"', '"reverse_link_broken"'], [`"route_hint": "${route}"`, '"route_hint": "broken"']]) {
      const changed = source.matrix.slice(0, start) + block.replace(token, replacement) + source.matrix.slice(end < 0 ? source.matrix.length : end);
      if (!audit({ ...source, matrix: changed }).length) { console.error(`${LABEL} SELFTEST FAIL — ${id} ${token}`); process.exit(1); }
    }
  }
  if (!audit({ ...source, self: source.self.replace(HEADER, HEADER.replace('"vertical":"class-sweep"', '"vertical":"broken"')) }).length) { console.error(`${LABEL} SELFTEST FAIL — header`); process.exit(1); }
  const feed = JSON.parse(source.feed); feed.entries.unshift({ guard: files.self, modules: ["legal"], cols: ["reverse_link"], leafRe: ".*" });
  if (!audit({ ...source, feed: JSON.stringify(feed) }).length) { console.error(`${LABEL} SELFTEST FAIL — feed`); process.exit(1); }
  console.log(`${LABEL} SELFTEST PASS — 23 runtime/evidence mutations detected`); process.exit(0);
}
const failures = audit(source);
if (failures.length) { console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — claim picker→tenant writer→scoped detail→exact Claims reverse`);
