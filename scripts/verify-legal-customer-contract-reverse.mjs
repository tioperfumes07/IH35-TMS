#!/usr/bin/env node
/** @matrix-built {"modules":["legal"],"cols":["reverse_link"],"leafRe":"^legal\\.(modal|parity)\\.lease_to_own_creator$","task":"LEGAL-CUSTOMER-CONTRACT-REVERSE","vertical":"column-wave"} */
/** @matrix-built {"modules":["customers"],"cols":["reverse_link"],"leafRe":"^detail\\.contracts$","task":"LEGAL-CUSTOMER-CONTRACT-REVERSE","vertical":"column-wave"} */

import fs from "node:fs";
const sources = {
  send: fs.readFileSync("apps/frontend/src/pages/legal/contracts/SendContractModal.tsx", "utf8"),
  lease: fs.readFileSync("apps/frontend/src/pages/legal/contracts/LeaseToOwnCreatorModal.tsx", "utf8"),
  customer: fs.readFileSync("apps/frontend/src/components/customers/CustomerContractsTab.tsx", "utf8"),
  writer: fs.readFileSync("apps/backend/src/legal/contracts.service.ts", "utf8"),
  page: fs.readFileSync("apps/frontend/src/pages/legal/contracts/LegalContractInstancesPage.tsx", "utf8"),
};
const checks = [
  ["send", /listCustomers\(\{ operating_company_id: operatingCompanyId[\s\S]*search: customerSearch/, "send reads scoped customers"],
  ["send", /createKind="customer"[\s\S]*onSearch=\{setCustomerSearch\}/, "send keeps customer create and search"],
  ["send", /signer_entity_id: signerEntityId \|\| undefined/, "send forwards customer FK"],
  ["lease", /listCustomers\(\{ operating_company_id: operatingCompanyId[\s\S]*search: customerSearch/, "lease reads scoped customers"],
  ["lease", /createKind="customer"[\s\S]*onSearch=\{setCustomerSearch\}/, "lease keeps customer create and search"],
  ["lease", /signer_entity_id: lesseeCustomerId/, "lease forwards customer FK"],
  ["lease", /onSaved\(created\.id\)/, "lease returns persisted id"],
  ["writer", /FROM mdata\.customers[\s\S]*id = \$1::uuid[\s\S]*operating_company_id = \$2::uuid[\s\S]*deactivated_at IS NULL/, "writer validates active customer ownership"],
  ["customer", /signer_type: "customer", signer_entity_id: customerId/, "customer reverse read filters canonical FK"],
  ["customer", /kind="legal_contract"[\s\S]{0,80}id=\{contract\.id\}/, "customer reverse row drills to selected contract"],
  ["customer", /Couldn't load this customer's legal contracts[\s\S]*legalContractsQuery\.refetch\(\)/, "customer reverse failure is retryable"],
  ["page", /onSaved=\{async \(contractId\)[\s\S]*setSearchParams\(\{ contract_id: contractId \}\)/, "lease R=W selects persisted detail"],
];
const failures = (candidate) => checks.filter(([key, pattern]) => !pattern.test(candidate[key])).map(([, , label]) => label);
const found = failures(sources);
if (found.length) { console.error(`verify-legal-customer-contract-reverse: FAIL — ${found.join("; ")}`); process.exit(1); }
if (process.argv.includes("--self-test")) {
  for (const [key, pattern, label] of checks) {
    const mutant = { ...sources, [key]: sources[key].replace(pattern, "/* planted defect */") };
    if (!failures(mutant).includes(label)) { console.error(`verify-legal-customer-contract-reverse: SELF-TEST FAIL — ${label}`); process.exit(1); }
  }
  console.log(`verify-legal-customer-contract-reverse: SELF-TEST PASS — ${checks.length} planted defects rejected`);
}
console.log(`verify-legal-customer-contract-reverse: PASS — ${checks.length} customer contract invariants`);
