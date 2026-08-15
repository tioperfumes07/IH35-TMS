#!/usr/bin/env node
/** @matrix-built {"modules":["legal"],"cols":["connectivity"],"leafRe":"^legal\\.(modal|parity)\\.unified_contract_creator$","task":"LINK-F5170-CUSTOMER-PICKER-CANONICAL-LABELS","vertical":"class-sweep"} */
/** @matrix-built {"modules":["dispatch"],"cols":["customer","connectivity"],"leafRe":"^settings\\.notify$","task":"LINK-F5170-CUSTOMER-PICKER-CANONICAL-LABELS","vertical":"class-sweep"} */
/** @matrix-built {"modules":["docs"],"cols":["connectivity"],"leafRe":"^docs\\.modal\\.upload$","task":"LINK-F5170-CUSTOMER-PICKER-CANONICAL-LABELS","vertical":"class-sweep"} */
/** @matrix-built {"modules":["safety"],"cols":["customer","connectivity"],"leafRe":"^complaints\\.list$","task":"LINK-F5170-CUSTOMER-PICKER-CANONICAL-LABELS","vertical":"class-sweep"} */

import fs from "node:fs";

const LABEL = "verify-customer-picker-canonical-labels";
const FILES = {
  api: "apps/frontend/src/api/mdata.ts",
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
  ["api", /apiRequest<\{ customers: Customer\[\]; total\?: number \}>/, "listCustomers returns the typed canonical contract"],
  ["legal", /listCustomers\(\{[\s\S]{0,180}operating_company_id: operatingCompanyId[\s\S]{0,180}search: customerSearch \|\| undefined/, "Legal customer roster is company-scoped and server-searched"],
  ["legal", /label: entityLabel\(c\.name, c\.id, "Customer"\)/, "Legal customer options use canonical labels"],
  ["legal", /type: c\.customer_code \?\? c\.customer_type \?\? "Customer"/, "Legal customer sublabels are human-readable"],
  ["legal", /label: entityLabel\(vendor\.name, vendor\.id, "Vendor"\)/, "Legal vendor options reject UUID-shaped names"],
  ["legal", /type: vendor\.vendor_code \?\? vendor\.vendor_type/, "Legal vendor sublabels are human-readable"],
  ["legal", /type: p\.type \?\? undefined/, "Legal customer picker does not expose the selected UUID as a sublabel"],
  ["legal", /type: vendor\.type \?\? undefined/, "Legal vendor picker does not expose the selected UUID as a sublabel"],
  ["dispatch", /label: entityLabel\(c\.name, c\.id, "Customer"\)/, "Dispatch notification customer picker uses canonical labels"],
  ["docs", /label: entityLabel\(customer\.name \?\? customer\.customer_code, customer\.id, "Customer"\)/, "Documents upload customer picker uses canonical labels"],
  ["safety", /label: entityLabel\(c\.name, c\.id, "Customer"\)/, "Safety complaint customer picker uses canonical labels"],
  ["safety", /label: entityLabel\(u\.name \|\| u\.email, u\.id, "User"\)/, "Safety complaint user picker rejects raw UUID fallback"],
];

function failures(sources) {
  const found = checks
    .filter(([key, pattern]) => !pattern.test(sources[key]))
    .map(([, , description]) => description);

  const forbidden = [
    ["legal", /customer_name\?: string|\.customer_name\s*\?\?|label:\s*String\(c\.id\)|type:\s*(?:p|vendor)\.id/, "Legal creator contains an obsolete field or raw-ID label/sublabel"],
    ["dispatch", /label:\s*c\.name\s*\?\?\s*c\.id/, "Dispatch customer picker contains a raw-ID fallback"],
    ["docs", /label:\s*customer\.name\s*\?\?[\s\S]{0,80}customer\.id/, "Documents customer picker contains a raw-ID fallback"],
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
    ["api", "customers: Customer[]", "customers: Array<Record<string, unknown>>"],
    ["legal", "listCustomers({\n        operating_company_id: operatingCompanyId", "listCustomers({\n        operating_company_id_removed: operatingCompanyId"],
    ["legal", 'label: entityLabel(c.name, c.id, "Customer")', "label: String(c.id)"],
    ["legal", 'type: c.customer_code ?? c.customer_type ?? "Customer"', "type: c.id"],
    ["legal", 'label: entityLabel(vendor.name, vendor.id, "Vendor")', "label: vendor.id"],
    ["legal", "type: vendor.vendor_code ?? vendor.vendor_type", "type: vendor.id"],
    ["legal", "type: p.type ?? undefined", "type: p.id"],
    ["legal", "type: vendor.type ?? undefined", "type: vendor.id"],
    ["dispatch", 'label: entityLabel(c.name, c.id, "Customer")', "label: c.name ?? c.id"],
    ["docs", 'label: entityLabel(customer.name ?? customer.customer_code, customer.id, "Customer")', "label: customer.name ?? customer.customer_code ?? customer.id"],
    ["safety", 'label: entityLabel(c.name, c.id, "Customer")', "label: String(c.name ?? c.id)"],
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
