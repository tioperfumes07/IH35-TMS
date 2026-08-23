#!/usr/bin/env node
/** @matrix-built {"modules":["legal"],"cols":["reverse_link"],"leafRe":"^legal\\.(modal|parity)\\.lease_to_own_creator$","task":"LEGAL-CUSTOMER-CONTRACT-REVERSE","vertical":"column-wave"} */
/** @matrix-built {"modules":["customers"],"cols":["reverse_link"],"leafRe":"^detail\\.contracts$","task":"LEGAL-CUSTOMER-CONTRACT-REVERSE","vertical":"column-wave"} */

import fs from "node:fs";
const sources = {
  send: fs.readFileSync("apps/frontend/src/pages/legal/contracts/SendContractModal.tsx", "utf8"),
  lease: fs.readFileSync("apps/frontend/src/pages/legal/contracts/LeaseToOwnCreatorModal.tsx", "utf8"),
  customer: fs.readFileSync("apps/frontend/src/components/customers/CustomerContractsTab.tsx", "utf8"),
  writer: fs.readFileSync("apps/backend/src/legal/contracts.service.ts", "utf8"),
  contracts: fs.readFileSync("apps/backend/src/customer-contracts/customer-contract.routes.ts", "utf8"),
  page: fs.readFileSync("apps/frontend/src/pages/legal/contracts/LegalContractInstancesPage.tsx", "utf8"),
};
const checks = [
  ["send", /<EntityPicker[\s\S]*?kind=["']customer["'][\s\S]*?allowCreate/, "send uses EntityPicker customer allowCreate"],
  ["send", /getCustomerDetail\(id, operatingCompanyId\)/, "send hydrates customer signer"],
  ["send", /signer_entity_id: signerEntityId \|\| undefined/, "send forwards customer FK"],
  ["lease", /<EntityPicker[\s\S]*?kind=["']customer["'][\s\S]*?allowCreate/, "lease uses EntityPicker customer allowCreate"],
  ["lease", /getCustomerDetail\(id, operatingCompanyId\)/, "lease hydrates lessee customer"],
  ["lease", /signer_entity_id: lesseeCustomerId/, "lease forwards customer FK"],
  ["lease", /onSaved\(created\.id\)/, "lease returns persisted id"],
  ["lease", /listCustomers\(|createKind=["']customer["']/, "lease must not keep capped listCustomers ReferenceSelect"],
  ["writer", /FROM mdata\.customers[\s\S]*id = \$1::uuid[\s\S]*operating_company_id = \$2::uuid[\s\S]*deactivated_at IS NULL/, "writer validates active customer ownership"],
  ["customer", /signer_type: "customer", signer_entity_id: customerId/, "customer reverse read filters canonical FK"],
  ["customer", /kind="legal_contract"[\s\S]{0,80}id=\{contract\.id\}/, "customer reverse row drills to selected contract"],
  ["customer", /Couldn't load this customer's legal contracts[\s\S]*legalContractsQuery\.refetch\(\)/, "customer reverse failure is retryable"],
  ["contracts", /LEFT JOIN docs\.files f ON f\.id = c\.file_id\s+AND f\.operating_company_id = c\.operating_company_id\s+AND f\.deleted_at IS NULL/g, "both customer contract reads scope file metadata to contract company"],
  ["page", /onSaved=\{async \(contractId\)[\s\S]*setSearchParams\(\{ contract_id: contractId \}\)/, "lease R=W selects persisted detail"],
];

// Positive checks that must MATCH; the lease "must not keep" row is inverted.
function failures(candidate) {
  const found = [];
  for (const [key, pattern, label] of checks) {
    if (label.includes("must not keep")) {
      if (pattern.test(candidate[key])) found.push(label);
    } else if (label === "both customer contract reads scope file metadata to contract company") {
      const matches = candidate[key].match(pattern) ?? [];
      if (matches.length !== 2) found.push(label);
    } else if (!pattern.test(candidate[key])) {
      found.push(label);
    }
  }
  return found;
}
const found = failures(sources);
if (found.length) { console.error(`verify-legal-customer-contract-reverse: FAIL — ${found.join("; ")}`); process.exit(1); }
if (process.argv.includes("--self-test") || process.argv.includes("--selftest")) {
  for (const [key, pattern, label] of checks) {
    if (label.includes("must not keep")) {
      const mutant = {
        ...sources,
        [key]: sources[key] + `\nlistCustomers({ operating_company_id: operatingCompanyId, search: customerSearch })\ncreateKind="customer"\n`,
      };
      if (!failures(mutant).includes(label)) {
        console.error(`verify-legal-customer-contract-reverse: SELF-TEST FAIL — ${label}`);
        process.exit(1);
      }
      continue;
    }
    const mutant = { ...sources, [key]: sources[key].replace(pattern, "/* planted defect */") };
    if (!failures(mutant).includes(label)) {
      console.error(`verify-legal-customer-contract-reverse: SELF-TEST FAIL — ${label}`);
      process.exit(1);
    }
  }
  console.log(`verify-legal-customer-contract-reverse: SELF-TEST PASS — ${checks.length} planted defects rejected`);
}
console.log(`verify-legal-customer-contract-reverse: PASS — ${checks.length} customer contract invariants`);
