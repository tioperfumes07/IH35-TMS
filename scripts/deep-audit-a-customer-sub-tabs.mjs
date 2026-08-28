#!/usr/bin/env node
/**
 * CLOSURE-14-DEEP-AUDIT-A — static guard for Customers master-detail sub-tabs.
 * Prevents regression: transaction_list + coi_requests must stay wired; tab inventory must not shrink.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const customersPath = path.join(repoRoot, "apps/frontend/src/pages/Customers.tsx");
const auditPath = path.join(repoRoot, "docs/audits/DEEP-AUDIT-A-CUSTOMER-DETAIL.md");

const REQUIRED_TAB_IDS = [
  "transaction_list",
  "activity_feed",
  "statements",
  "recurring_transactions",
  "projects",
  "customer_details",
  "late_fees",
  "notes",
  "tasks",
  "opportunities",
  "conversations",
  "coi_requests",
];

const source = fs.readFileSync(customersPath, "utf8");
const audit = fs.existsSync(auditPath) ? fs.readFileSync(auditPath, "utf8") : "";
function auditSources(sourceText, auditText) {
const failures = [];

for (const tabId of REQUIRED_TAB_IDS) {
  if (!sourceText.includes(`id: "${tabId}"`)) {
    failures.push(`Customers.tsx missing CUSTOMER_TABS entry id: "${tabId}"`);
  }
}

if (!sourceText.includes("listAllInvoices(companyId")) {
  failures.push("transaction_list tab must exhaust scoped invoices through listAllInvoices");
}
if (!sourceText.includes('activeTab === "coi_requests"')) {
  failures.push("coi_requests tab branch must exist");
}
if (!sourceText.includes("CustomerCOITab")) {
  failures.push("coi_requests must render CustomerCOITab component");
}
if (!sourceText.includes("getCustomerBillingSummary")) {
  failures.push("customer header must load billing summary on selection");
}
if (!sourceText.includes("SecondaryNavTabs")) {
  failures.push("Customers master-detail must use SecondaryNavTabs for sub-tab nav");
}

for (const section of ["Transaction List", "COI Requests", "CRITICAL", "HIGH"]) {
  if (!auditText.includes(section)) {
    failures.push(`audit doc missing required section heading: ${section}`);
  }
}
return failures;
}

const failures = auditSources(source, audit);

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replaceAll("listAllInvoices(companyId", "listInvoices(companyId"),
    source.replace('activeTab === "coi_requests"', 'activeTab === "removed_coi"'),
    source.replaceAll("CustomerCOITab", "RemovedCOITab"),
  ];
  for (const [index, mutated] of mutations.entries()) {
    if (mutated === source || auditSources(mutated, audit).length === 0) {
      console.error(`deep-audit-a-customer-sub-tabs SELFTEST FAILED — mutation ${index + 1} escaped`);
      process.exit(1);
    }
  }
  console.log(`deep-audit-a-customer-sub-tabs SELFTEST PASS — ${mutations.length} mutations detected`);
  process.exit(0);
}

if (failures.length > 0) {
  console.error("deep-audit-a-customer-sub-tabs — FAILED");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("deep-audit-a-customer-sub-tabs — OK (12 sub-tabs enumerated, transaction_list + COI wired)");
