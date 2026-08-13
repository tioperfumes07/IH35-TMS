#!/usr/bin/env node
/** @matrix-built {"modules":["legal"],"cols":["reverse_link"],"leafRe":"^legal\\.(modal|parity)\\.(send_contract|truck_lease_creator)$","task":"LEGAL-VENDOR-SIGNER-CREATORS","vertical":"column-wave"} */
/** @matrix-built {"modules":["vendors"],"cols":["reverse_link"],"leafRe":"^detail\\.profile$","task":"LEGAL-VENDOR-SIGNER-CREATORS","vertical":"column-wave"} */
import fs from "node:fs";
const sources = {
  send: fs.readFileSync("apps/frontend/src/pages/legal/contracts/SendContractModal.tsx", "utf8"),
  truck: fs.readFileSync("apps/frontend/src/pages/legal/contracts/TruckLeaseCreatorModal.tsx", "utf8"),
  page: fs.readFileSync("apps/frontend/src/pages/legal/contracts/LegalContractInstancesPage.tsx", "utf8"),
  writer: fs.readFileSync("apps/backend/src/legal/contracts.service.ts", "utf8"),
};
const checks = [
  ["send", /listVendors\(\{ operating_company_id: operatingCompanyId[\s\S]*search: vendorSearch/, "send wizard reads scoped vendors"],
  ["send", /signer_entity_id: signerEntityId \|\| undefined/, "send wizard FK reaches payload"],
  ["send", /createKind="vendor"[\s\S]*onSearch=\{setVendorSearch\}/, "send wizard keeps inline create and search"],
  ["send", /onSent\(created\.id\)/, "send wizard returns persisted id"],
  ["truck", /listVendors\(\{ operating_company_id: operatingCompanyId[\s\S]*search: vendorSearch/, "truck lease reads scoped vendors"],
  ["truck", /signer_entity_id: lesseeVendorId/, "truck lease FK reaches payload"],
  ["truck", /createKind="vendor"[\s\S]*onSearch=\{setVendorSearch\}/, "truck lease keeps inline create and search"],
  ["truck", /onSaved\(created\.id\)/, "truck lease returns persisted id"],
  ["page", /onSent=\{async \(contractId\)[\s\S]*contract_id: contractId/, "send R=W selects persisted detail"],
  ["page", /onSaved=\{\(contractId\)[\s\S]*contract_id: contractId/, "truck R=W selects persisted detail"],
  ["writer", /FROM mdata\.vendors[\s\S]*operating_company_id = \$2::uuid/, "writer enforces vendor company ownership"],
];
const failures = (candidate) => checks.filter(([key, pattern]) => !pattern.test(candidate[key])).map(([, , label]) => label);
const found = failures(sources);
if (found.length) { console.error(`verify-legal-vendor-signer-creators: FAIL — ${found.join("; ")}`); process.exit(1); }
if (process.argv.includes("--self-test")) {
  for (const [key, pattern, label] of checks) {
    const mutant = { ...sources, [key]: sources[key].replace(pattern, "/* planted defect */") };
    if (!failures(mutant).includes(label)) { console.error(`verify-legal-vendor-signer-creators: SELF-TEST FAIL — ${label}`); process.exit(1); }
  }
  console.log(`verify-legal-vendor-signer-creators: SELF-TEST PASS — ${checks.length} planted defects rejected`);
}
console.log(`verify-legal-vendor-signer-creators: PASS — ${checks.length} vendor signer invariants`);
