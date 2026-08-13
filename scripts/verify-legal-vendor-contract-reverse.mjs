#!/usr/bin/env node
/** @matrix-built {"modules":["legal"],"cols":["reverse_link"],"leafRe":"^(contracts\\.(list|create)|legal\\.(modal|parity)\\.unified_contract_creator)$","task":"LEGAL-VENDOR-CONTRACT-REVERSE","vertical":"column-wave"} */
/** @matrix-built {"modules":["vendors"],"cols":["reverse_link"],"leafRe":"^detail\\.profile$","task":"LEGAL-VENDOR-CONTRACT-REVERSE","vertical":"column-wave"} */
/** @matrix-built {"modules":["users"],"cols":["reverse_link"],"leafRe":"^detail$","task":"LEGAL-VENDOR-CONTRACT-REVERSE","vertical":"column-wave"} */

import fs from "node:fs";

const paths = {
  creator: "apps/frontend/src/pages/legal/contracts/UnifiedContractCreatorModal.tsx",
  page: "apps/frontend/src/pages/legal/contracts/LegalContractInstancesPage.tsx",
  api: "apps/frontend/src/api/legal-contracts.ts",
  reverse: "apps/frontend/src/components/legal/VendorLegalContractsReverseSection.tsx",
  vendor: "apps/frontend/src/pages/VendorDetail.tsx",
  service: "apps/backend/src/legal/contracts.service.ts",
  routes: "apps/backend/src/legal/contracts.routes.ts",
};

const sources = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, fs.readFileSync(path, "utf8")]));

const checks = [
  ["creator", /listVendors\(\{[\s\S]*operating_company_id: operatingCompanyId[\s\S]*search: vendorSearch/, "vendor picker reads the scoped canonical roster"],
  ["creator", /createKind="vendor"[\s\S]*onSearch=\{setVendorSearch\}/, "vendor picker keeps Add-new and server search"],
  ["creator", /signer_entity_id: signerEntityId \|\| undefined/, "selected vendor FK reaches create payload"],
  ["creator", /onSaved\(created\.id\)/, "creator returns the persisted contract id"],
  ["service", /FROM mdata\.vendors[\s\S]*id = \$1::uuid[\s\S]*operating_company_id = \$2::uuid[\s\S]*deactivated_at IS NULL/, "writer validates active vendor ownership"],
  ["routes", /legal_signer_entity_required[\s\S]*legal_signer_entity_not_found/, "writer exposes deterministic validation errors"],
  ["routes", /app\.get\("\/api\/v1\/legal\/contracts", \{ config: \{ rateLimit: \{ max: 60, timeWindow: "1 minute" \}/, "scoped reverse list is rate-limited"],
  ["routes", /app\.post\("\/api\/v1\/legal\/contracts", \{ config: \{ rateLimit: \{ max: 30, timeWindow: "1 minute" \}/, "contract writer is rate-limited"],
  ["service", /ci\.signer_type = \$\$?\{values\.length\}`/, "reverse query filters signer type without inventing an enum"],
  ["service", /ci\.signer_entity_id = \$\$?\{values\.length\}::uuid/, "reverse query filters signer FK"],
  ["reverse", /signer_type: "vendor", signer_entity_id: vendorId/, "vendor profile reverse read is FK-filtered"],
  ["vendor", /<VendorLegalContractsReverseSection operatingCompanyId=\{companyId\} vendorId=\{vendor\.id\}/, "vendor profile mounts contract reverse section"],
  ["page", /contract_id[\s\S]*setActiveDetailId\(linkedContractId\)/, "contract route opens the requested persisted row"],
  ["page", /kind=\{signerKind\(detailQuery\.data\.signer_type\)!\}[\s\S]*signer_entity_id/, "contract detail drills to canonical signer profile"],
  ["page", /Couldn't load contract detail[\s\S]*detailQuery\.refetch\(\)/, "contract detail exposes retryable failures"],
  ["page", /onSaved=\{async \(contractId\)[\s\S]*setActiveDetailId\(contractId\)[\s\S]*contract_id: contractId/, "create R=W selects the persisted row and URL"],
];

function failures(candidate) {
  return checks.filter(([key, pattern]) => !pattern.test(candidate[key])).map(([, , label]) => label);
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
  console.log(`verify-legal-vendor-contract-reverse: SELF-TEST PASS — ${proven} planted defects rejected`);
}

console.log(`verify-legal-vendor-contract-reverse: PASS — ${checks.length} vendor contract linkage invariants`);
