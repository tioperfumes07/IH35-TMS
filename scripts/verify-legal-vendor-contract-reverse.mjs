#!/usr/bin/env node
/** @matrix-built {"modules":["legal"],"cols":["reverse_link"],"leaves":["contracts.list","contracts.create"],"task":"LEGAL-F5896-CONTRACT-REVERSE-EXACT","vertical":"class-sweep"} */

import fs from "node:fs";

const paths = {
  creator: "apps/frontend/src/pages/legal/contracts/UnifiedContractCreatorModal.tsx",
  page: "apps/frontend/src/pages/legal/contracts/LegalContractInstancesPage.tsx",
  api: "apps/frontend/src/api/legal-contracts.ts",
  reverse: "apps/frontend/src/components/legal/VendorLegalContractsReverseSection.tsx",
  vendor: "apps/frontend/src/pages/VendorDetail.tsx",
  service: "apps/backend/src/legal/contracts.service.ts",
  routes: "apps/backend/src/legal/contracts.routes.ts",
  pickerRegistry: "apps/frontend/src/components/parity/entityPickerRegistry.ts",
  matrix: "docs/specs/scoreboard/modules/legal.required.json",
  feed: "docs/specs/scoreboard/wire-sprint-built.json",
  self: "scripts/verify-legal-vendor-contract-reverse.mjs",
};
const HEADER = '/** @matrix-built {"modules":["legal"],"cols":["reverse_link"],"leaves":["contracts.list","contracts.create"],"task":"LEGAL-F5896-CONTRACT-REVERSE-EXACT","vertical":"class-sweep"} */';

const sources = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, fs.readFileSync(path, "utf8")]));

const checks = [
  ["creator", /<EntityPicker[\s\S]{0,220}kind="vendor"[\s\S]{0,220}allowCreate[\s\S]{0,220}operatingCompanyId=\{operatingCompanyId\}/, "creator mounts the scoped canonical vendor picker with Add-new"],
  ["pickerRegistry", /vendor:\s*\{[\s\S]{0,1200}inlineCreate:\s*\{ available: true \}[\s\S]{0,240}serverSearch:\s*true/, "shared vendor picker keeps Add-new and server search"],
  ["pickerRegistry", /vendor:\s*\{[\s\S]{0,2200}listVendors\(\{[\s\S]{0,240}operating_company_id: operatingCompanyId[\s\S]{0,240}search: opts\?\.search/, "shared vendor picker reads the scoped canonical roster"],
  ["creator", /signer_entity_id: signerEntityId \|\| undefined/, "selected vendor FK reaches create payload"],
  ["creator", /onSaved\(created\.id\)/, "creator returns the persisted contract id"],
  ["service", /FROM mdata\.vendors[\s\S]*id = \$1::uuid[\s\S]*operating_company_id = \$2::uuid[\s\S]*deactivated_at IS NULL/, "writer validates active vendor ownership"],
  ["routes", /legal_signer_entity_required[\s\S]*legal_signer_entity_not_found/, "writer exposes deterministic validation errors"],
  ["routes", /app\.get\("\/api\/v1\/legal\/contracts", \{ config: \{ rateLimit: \{ max: 60, timeWindow: "1 minute" \}/, "scoped reverse list is rate-limited"],
  ["routes", /app\.post\("\/api\/v1\/legal\/contracts", \{ config: \{ rateLimit: \{ max: 30, timeWindow: "1 minute" \}/, "contract writer is rate-limited"],
  ["routes", /setOperatingCompany\(client, parsed\.data\.operating_company_id\)[\s\S]{0,260}listContractInstances\(client, \{[\s\S]{0,180}operatingCompanyId: parsed\.data\.operating_company_id[\s\S]{0,220}signerType: parsed\.data\.signer_type[\s\S]{0,120}signerEntityId: parsed\.data\.signer_entity_id/, "list route scopes the session and delegates the exact company and signer filters"],
  ["service", /const values: unknown\[\] = \[args\.operatingCompanyId\][\s\S]{0,100}const where: string\[\] = \["ci\.operating_company_id = \$1::uuid"\]/, "reverse query seeds the selected company predicate"],
  ["service", /ci\.signer_type = \$\$?\{values\.length\}`/, "reverse query filters signer type without inventing an enum"],
  ["service", /ci\.signer_entity_id = \$\$?\{values\.length\}::uuid/, "reverse query filters signer FK"],
  ["api", /params\.set\("operating_company_id", input\.operating_company_id\)[\s\S]{0,220}params\.set\("signer_type", input\.signer_type\)[\s\S]{0,140}params\.set\("signer_entity_id", input\.signer_entity_id\)[\s\S]{0,180}`\/api\/v1\/legal\/contracts\?\$\{params\.toString\(\)\}`/, "frontend client serializes company plus both signer filters into the canonical GET"],
  ["reverse", /signer_type: "vendor", signer_entity_id: vendorId/, "vendor profile reverse read is FK-filtered"],
  ["reverse", /queryKey: \["legal", "contracts", "vendor", operatingCompanyId, vendorId\][\s\S]{0,220}enabled: Boolean\(operatingCompanyId && vendorId\)[\s\S]{0,220}operating_company_id: operatingCompanyId, signer_type: "vendor", signer_entity_id: vendorId/, "vendor reverse query identity, enablement, and GET share company plus vendor id"],
  ["reverse", /<EntityLink kind="legal_contracts_vendor" id=\{vendorId\} label="Open Contracts"/, "vendor reverse header opens the exact vendor-filtered contracts route"],
  ["reverse", /rows\.map\(\(contract\) => \([\s\S]{0,180}<li key=\{contract\.id\}[\s\S]{0,180}<EntityLink kind="legal_contract" id=\{contract\.id\} label=\{contract\.display_name_en \?\? contract\.template_code\}/, "each returned contract drills by canonical id with a human contract label"],
  ["vendor", /<VendorLegalContractsReverseSection operatingCompanyId=\{companyId\} vendorId=\{vendor\.id\}/, "vendor profile mounts contract reverse section"],
  ["page", /contract_id[\s\S]*setActiveDetailId\(linkedContractId\)/, "contract route opens the requested persisted row"],
  ["page", /kind=\{signerKind\(detailQuery\.data\.signer_type\)!\}[\s\S]*signer_entity_id/, "contract detail drills to canonical signer profile"],
  ["page", /Couldn't load contract detail[\s\S]*detailQuery\.refetch\(\)/, "contract detail exposes retryable failures"],
  ["page", /onSaved=\{async \(contractId\)[\s\S]*setActiveDetailId\(contractId\)[\s\S]*contract_id: contractId/, "create R=W selects the persisted row and URL"],
];

function failures(candidate) {
  const found = checks.filter(([key, pattern]) => !pattern.test(candidate[key])).map(([, , label]) => label);
  let matrix;
  try { matrix = JSON.parse(candidate.matrix); } catch (error) { found.push(`Legal matrix parse: ${error.message}`); }
  for (const id of ["contracts.list", "contracts.create"]) {
    const leaf = matrix?.leaves?.find((item) => item.id === id);
    if (!leaf?.required?.includes("reverse_link")) found.push(`${id} must require reverse_link`);
    if (leaf?.route_hint !== "/legal/contracts") found.push(`${id} must name mounted /legal/contracts route`);
  }
  if (!candidate.self.split('import fs from "node:fs";')[0].includes(HEADER)) found.push("exact contract header missing");
  try { if (JSON.parse(candidate.feed).entries?.some((entry) => entry.guard === paths.self)) found.push("manual feed duplicates exact ownership"); }
  catch (error) { found.push(`feed parse: ${error.message}`); }
  return found;
}

const found = failures(sources);
if (found.length) {
  console.error(`verify-legal-vendor-contract-reverse: FAIL — ${found.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--self-test")) {
  let proven = 0;
  for (const [key, pattern, label] of checks) {
    const mutant = { ...sources, [key]: sources[key].replace(pattern, "/* planted defect */") };
    if (!failures(mutant).includes(label)) {
      console.error(`verify-legal-vendor-contract-reverse: SELF-TEST FAIL — ${label}`);
      process.exit(1);
    }
    proven += 1;
  }
  for (const id of ["contracts.list", "contracts.create"]) {
    const idToken = `"id": "${id}"`, start = sources.matrix.indexOf(idToken), end = sources.matrix.indexOf("\n    {", start + idToken.length), block = sources.matrix.slice(start, end < 0 ? sources.matrix.length : end);
    for (const [token, replacement] of [[idToken, `"id": "${id}.broken"`], ['"reverse_link"', '"reverse_link_broken"'], ['"route_hint": "/legal/contracts"', '"route_hint": "broken"']]) {
      const changed = sources.matrix.slice(0, start) + block.replace(token, replacement) + sources.matrix.slice(end < 0 ? sources.matrix.length : end);
      if (!failures({ ...sources, matrix: changed }).length) throw new Error(`matrix mutation survived: ${id} ${token}`);
    }
  }
  const broken = HEADER.replace('"vertical":"class-sweep"', '"vertical":"broken"');
  if (!failures({ ...sources, self: sources.self.replace(HEADER, broken) }).length) throw new Error("header mutation survived");
  const feed = JSON.parse(sources.feed); feed.entries.unshift({ guard: paths.self, modules: ["legal"], cols: ["reverse_link"], leafRe: ".*" });
  if (!failures({ ...sources, feed: JSON.stringify(feed) }).length) throw new Error("feed mutation survived");
  console.log("verify-legal-vendor-contract-reverse: SELF-TEST PASS — 31 planted defects rejected");
}

console.log(`verify-legal-vendor-contract-reverse: PASS — ${checks.length} vendor contract linkage invariants`);
