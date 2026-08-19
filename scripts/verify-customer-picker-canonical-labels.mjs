#!/usr/bin/env node
/** @matrix-built {"modules":["legal"],"cols":["connectivity"],"leafRe":"^legal\\.(modal|parity)\\.unified_contract_creator$","task":"LINK-F5170-CUSTOMER-PICKER-CANONICAL-LABELS","vertical":"class-sweep"} */
/** @matrix-built {"modules":["dispatch"],"cols":["customer","connectivity"],"leafRe":"^settings\\.notify$","task":"LINK-F5170-CUSTOMER-PICKER-CANONICAL-LABELS","vertical":"class-sweep"} */
/** @matrix-built {"modules":["docs"],"cols":["connectivity"],"leafRe":"^docs\\.modal\\.upload$","task":"LINK-F5170-CUSTOMER-PICKER-CANONICAL-LABELS","vertical":"class-sweep"} */
/** @matrix-built {"modules":["safety"],"cols":["customer","connectivity"],"leafRe":"^complaints\\.list$","task":"LINK-F5170-CUSTOMER-PICKER-CANONICAL-LABELS","vertical":"class-sweep"} */

import fs from "node:fs";

const LABEL = "verify-customer-picker-canonical-labels";
const FILES = {
  api: "apps/frontend/src/api/mdata.ts",
  registry: "apps/frontend/src/components/parity/entityPickerRegistry.ts",
  legal: "apps/frontend/src/pages/legal/contracts/UnifiedContractCreatorModal.tsx",
  dispatch: "apps/frontend/src/pages/dispatch/NotifyPreferencesPage.tsx",
  docs: "apps/frontend/src/components/documents/UploadModal.tsx",
  safety: "apps/frontend/src/pages/safety/tabs/ComplaintsTab.tsx",
};

const readSources = () => Object.fromEntries(
  Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(file, "utf8")])
);

const checks = [
  ["api", /export type Customer = \{[\s\S]{0,120}name: string;/, "canonical Customer contract exposes name"],
  ["api", /apiRequest<\{ customers: Customer\[\]; total\?: number \} \| Customer\[\]>/, "listCustomers returns the typed canonical contract"],
  ["registry", /customer:[\s\S]{0,900}label: customer\.name,[\s\S]{0,120}sublabel: customer\.customer_code \|\| undefined/, "shared customer EntityPicker uses canonical labels"],
  ["legal", /<EntityPicker[\s\S]*?kind=["']customer["'][\s\S]*?allowCreate/, "Legal customer signer uses EntityPicker allowCreate"],
  ["legal", /entityLabel\(customer\.name, customer\.id, "Customer"\)/, "Legal customer hydrate uses canonical labels"],
  ["legal", /<EntityPicker[\s\S]*?kind=["']vendor["'][\s\S]*?allowCreate/, "Legal vendor signer uses EntityPicker allowCreate"],
  ["legal", /getVendor\(id, operatingCompanyId\)/, "Legal vendor hydrate via getVendor"],
  ["dispatch", /<EntityPicker[\s\S]*?kind=["']customer["'][\s\S]*?allowCreate/, "Dispatch notification customer uses EntityPicker allowCreate"],
  ["docs", /value: "customer", label: "Customer"[\s\S]{0,12000}<EntityPicker[\s\S]{0,200}kind=\{standaloneLinkToPickerKind\(linkEntityType\)\}/, "Documents upload customer picker uses canonical labels"],
  ["safety", /<EntityPicker[\s\S]*?kind=["']customer["'][\s\S]*?allowCreate/, "Safety complaint customer uses EntityPicker allowCreate"],
  ["safety", /label: entityLabel\(u\.name \|\| u\.email, u\.id, "User"\)/, "Safety complaint user picker rejects raw UUID fallback"],
];

function failures(sources) {
  const found = checks
    .filter(([key, pattern]) => !pattern.test(sources[key]))
    .map(([, , description]) => description);

  const forbidden = [
    ["legal", /listCustomers\(|listVendors\(|createKind=["']customer["']|createKind=["']vendor["']/, "Legal creator must not regress to capped listCustomers/listVendors ReferenceSelect"],
    ["legal", /customer_name\?: string|\.customer_name\s*\?\?|label:\s*String\(c\.id\)/, "Legal creator contains an obsolete field or raw-ID label"],
    ["dispatch", /listCustomers\(|createKind=["']customer["']/, "Dispatch notify must not regress to listCustomers ReferenceSelect"],
    ["dispatch", /label:\s*c\.name\s*\?\?\s*c\.id/, "Dispatch customer picker contains a raw-ID fallback"],
    ["docs", /label:\s*customer\.name\s*\?\?[\s\S]{0,80}customer\.id/, "Documents customer picker contains a raw-ID fallback"],
    ["safety", /listCustomers\(|createKind=["']customer["']/, "Safety complaint must not regress to listCustomers ReferenceSelect"],
    ["safety", /label:\s*String\(c\.name\s*\?\?\s*c\.id\)|label:\s*String\(u\.name\s*\|\|\s*u\.email\s*\|\|\s*u\.id\)/, "Safety complaint picker contains a raw-ID fallback"],
  ];
  for (const [key, pattern, description] of forbidden) {
    if (pattern.test(sources[key])) found.push(description);
  }
  return found;
}

const sources = readSources();

if (process.argv.includes("--selftest") || process.argv.includes("--self-test")) {
  const mutations = [
    ["api", "export type Customer = {\n  id: string;\n  name: string;", "export type Customer = {\n  id: string;\n  canonical_name_removed: string;"],
    ["api", "customers: Customer[]; total?: number } | Customer[]", "customers: Array<Record<string, unknown>>; total?: number }"],
    ["registry", "label: customer.name,", "label: customer.id,"],
    ["legal", 'kind="customer"', 'kind="unit"'],
    ["legal", 'entityLabel(customer.name, customer.id, "Customer")', "String(customer.id)"],
    ["legal", 'kind="vendor"', 'kind="unit"'],
    ["legal", "getVendor(id, operatingCompanyId)", "getVendorRemoved(id, operatingCompanyId)"],
    ["dispatch", '<EntityPicker\n              kind="customer"\n              operatingCompanyId={companyId}', '<EntityPicker\n              kind="unit"\n              operatingCompanyId={companyId}'],
    ["docs", 'value: "customer", label: "Customer"', 'value: "unit", label: "Customer"'],
    ["safety", '<EntityPicker\n                kind="customer"\n                operatingCompanyId={companyId}', '<EntityPicker\n                kind="unit"\n                operatingCompanyId={companyId}'],
    ["safety", 'label: entityLabel(u.name || u.email, u.id, "User")', "label: String(u.name || u.email || u.id)"],
  ];
  const escaped = [];
  for (const [key, needle, replacement] of mutations) {
    if (!sources[key].includes(needle)) {
      escaped.push(`${key}: mutation anchor missing (${needle})`);
      continue;
    }
    const mutant = { ...sources, [key]: sources[key].replace(needle, replacement) };
    if (failures(mutant).length === 0) escaped.push(`${key}: planted defect escaped (${needle})`);
  }
  if (escaped.length) {
    console.error(`${LABEL} SELFTEST FAIL\n${escaped.join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}

const found = failures(sources);
if (found.length) {
  console.error(`${LABEL} FAIL\n${found.join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — canonical customer labels ratcheted across Legal, Dispatch, Documents, and Safety`);
