#!/usr/bin/env node
/** @matrix-built {"modules":["customers"],"cols":["customer"],"leafRe":"^(home\\.roster|list\\.(view_list|view_master_detail|segment\\.(all|preferred|watch|active|inactive|factored)|create|sync|filters)|md\\.(transaction_list|customer_details|coi_requests|new_transaction|tasks)|customers\\.panel\\.customers_sync)$","task":"LINK-F5165-CUSTOMERS-LIST-MASTER-DETAIL"} */
/**
 * OWNER-EXECUTION-PLAN vertical customer-column sweep (2026-08-14): the customers module's own
 * list/master-detail surfaces are all genuinely customer-record-scoped (Customers.tsx +
 * CustomersListView.tsx + CustomersSyncPanel.tsx) — real deactivated_at/quality_overall_flag/
 * factoring_company_vendor_id segment filters over the real customer roster, a real createCustomer
 * call, a bulk update scoped to mdata.customers, and real customer_id-keyed sub-tab queries.
 *
 * Self-test: node scripts/verify-customers-list-master-detail.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  customers: "apps/frontend/src/pages/Customers.tsx",
  listView: "apps/frontend/src/pages/customers/CustomersListView.tsx",
  sidebar: "apps/frontend/src/pages/customers/CustomerListSidebar.tsx",
  sync: "apps/frontend/src/pages/customers/CustomersSyncPanel.tsx",
};
const LABEL = "verify-customers-list-master-detail";

export function audit(src) {
  const failures = [];
  if (!/createCustomer\(profileValuesToCreatePayload\(/.test(src.customers)) {
    failures.push(`${FILES.customers}: list.create must call the canonical createCustomer`);
  }
  if (!/customer\.deactivated_at != null/.test(src.customers) || !/customer\.deactivated_at == null/.test(src.customers)) {
    failures.push(`${FILES.customers}: active/inactive segments must filter real customer.deactivated_at`);
  }
  if (!/c\.quality_overall_flag === "preferred"/.test(src.customers)) {
    failures.push(`${FILES.customers}: preferred segment must filter real quality_overall_flag`);
  }
  if (!/c\.quality_overall_flag === "caution"/.test(src.customers)) {
    failures.push(`${FILES.customers}: watch segment must filter real quality_overall_flag`);
  }
  if (!/Boolean\(c\.factoring_company_vendor_id\)/.test(src.customers)) {
    failures.push(`${FILES.customers}: factored segment must filter real factoring_company_vendor_id`);
  }
  if (!/customer_id: selectedCustomer!\.id/.test(src.customers)) {
    failures.push(`${FILES.customers}: transaction_list must query invoices scoped by real customer_id`);
  }
  if (!/customer_id=\$\{selectedCustomer\.id\}/.test(src.customers)) {
    failures.push(`${FILES.customers}: new_transaction must navigate with the real selected customer's id`);
  }
  if (!/targetType="customer"/.test(src.customers)) {
    failures.push(`${FILES.customers}: md.tasks must scope TasksTab to targetType="customer"`);
  }
  if (!/customer_id: customerId/.test(fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/customers/CoiTab.tsx"), "utf8"))) {
    failures.push("apps/frontend/src/pages/customers/CoiTab.tsx: md.coi_requests must submit a real customer_id");
  }
  if (!/<CustomersSyncPanel operatingCompanyId=\{companyId\} \/>/.test(src.customers)) {
    failures.push(`${FILES.customers}: customers.panel.customers_sync must mount the real sync panel`);
  }
  if (!/bulkUpdate\(\{ domain: "mdata", resource: "customers"/.test(src.listView)) {
    failures.push(`${FILES.listView}: list.view_list bulk actions must target the real mdata.customers resource`);
  }
  if (!/CardLink href=\{`\/customers\/\$\{customer\.id\}`\}/.test(src.sidebar)) {
    failures.push(`${FILES.sidebar}: home.roster rows must link to the real customer's own record`);
  }
  return failures;
}

function loadSrc(root) {
  return {
    customers: fs.readFileSync(path.join(root, FILES.customers), "utf8"),
    listView: fs.readFileSync(path.join(root, FILES.listView), "utf8"),
    sidebar: fs.readFileSync(path.join(root, FILES.sidebar), "utf8"),
  };
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    ["create-call", "customers", /createCustomer\(profileValuesToCreatePayload\(/, "createSomethingElse("],
    ["inactive-filter", "customers", /customer\.deactivated_at != null/g, "false"],
    ["preferred-filter", "customers", /c\.quality_overall_flag === "preferred"/g, 'false'],
    ["watch-filter", "customers", /c\.quality_overall_flag === "caution"/g, 'false'],
    ["factored-filter", "customers", /Boolean\(c\.factoring_company_vendor_id\)/g, "false"],
    ["transaction-list-scope", "customers", /customer_id: selectedCustomer!\.id/, "customer_id: undefined"],
    ["new-transaction-nav", "customers", /customer_id=\$\{selectedCustomer\.id\}/, "customer_id=none"],
    ["tasks-target-type", "customers", /targetType="customer"/, 'targetType="unit"'],
    ["sync-panel-mount", "customers", /<CustomersSyncPanel operatingCompanyId=\{companyId\} \/>/, "null"],
    ["bulk-resource", "listView", /bulkUpdate\(\{ domain: "mdata", resource: "customers"/, 'bulkUpdate({ domain: "mdata", resource: "units"'],
    ["sidebar-link", "sidebar", /CardLink href=\{`\/customers\/\$\{customer\.id\}`\}/, 'CardLink href="/customers"'],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const mutated = { ...good, [key]: good[key].replace(pattern, replacement) };
    if (mutated[key] === good[key]) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: pattern did not match source, re-anchor`);
      process.exit(1);
    }
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: mutation escaped`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — customers list/master-detail surfaces are genuinely customer-record-scoped`);
