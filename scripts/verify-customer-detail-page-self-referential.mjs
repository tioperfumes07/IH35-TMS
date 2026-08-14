#!/usr/bin/env node
/** @matrix-built {"modules":["customers"],"cols":["customer"],"leafRe":"^detail\\.(profile|contacts|contacts\\.create|billing|billing\\.record_payment|quality|quality\\.create_event|lanes|lanes\\.create|documents|coi|contracts|portal_users|tasks|loads|pnl|audit|edit|fmcsa_verify)$","task":"LINK-F5165-CUSTOMER-DETAIL-SELF-REFERENTIAL"} */
/**
 * OWNER-EXECUTION-PLAN vertical customer-column sweep (2026-08-14): CustomerDetail.tsx's 19 tabs/
 * actions are all genuinely self-referential to THIS customer (the page's own :id route param) —
 * each queryKey/mutation is keyed on `id`, confirmed by direct code citation for every leaf.
 *
 * Self-test: node scripts/verify-customer-detail-page-self-referential.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/CustomerDetail.tsx";
const LABEL = "verify-customer-detail-page-self-referential";

const CHECKS = [
  ["profile", /updateCustomer\(id, \{/],
  ["contacts", /queryKey: \["customer-contacts", id,/],
  ["contacts.create", /createCustomerContact\(id, payload, operatingCompanyId\)/],
  ["billing", /queryKey: \["customer-billing-summary", id,/],
  ["billing.record_payment", /recordCustomerPayment\(id, selectedCompanyId \?\? "", \{/],
  ["quality", /queryKey: \["customer-quality-events", id,/],
  ["quality.create_event", /createCustomerQualityEvent\(id, \{/],
  ["lanes", /queryKey: \["customer-lanes", id,/],
  ["lanes.create", /createCustomerLane\(id, operatingCompanyId!, payload\)/],
  ["documents", /<DocumentsTab entityType="customer" entityId=\{customer\.id\}/],
  ["coi", /customerId=\{customer\.id\}/],
  ["contracts", /<CustomerContractsTab[\s\S]{0,50}customerId=\{customer\.id\}/],
  ["portal_users", /<PortalUsersTab customerId=\{customer\.id\}/],
  ["tasks", /<TasksTab[\s\S]{0,50}targetType="customer" targetId=\{customer\.id\}/],
  ["loads", /queryKey: \["customer-loads", id,/],
  ["pnl", /queryKey: \["customer-pnl", id,/],
  ["audit", /<EntityAuditHistoryTab operatingCompanyId=\{operatingCompanyId \?\? ""\} entityType="customer" entityId=\{customer\.id\}/],
  ["edit", /await updateCustomer\(id, \{/],
  ["fmcsa_verify", /mutationFn: \(\) => verifyCustomerFmcsa\(id\)/],
];

export function audit(src) {
  const failures = [];
  for (const [name, pattern] of CHECKS) {
    if (!pattern.test(src)) failures.push(`${FILE}: ${name} tab is missing its self-referential customer scoping`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const good = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  let caught = 0;
  for (const [name, pattern] of CHECKS) {
    const mutated = good.replace(new RegExp(pattern.source, `${pattern.flags}g`), "REMOVED");
    if (mutated === good) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: pattern did not match source, re-anchor`);
      process.exit(1);
    }
    const failures = audit(mutated);
    if (!failures.some((f) => f.includes(name))) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: mutation escaped`);
      process.exit(1);
    }
    caught++;
  }
  console.log(`${LABEL} SELFTEST PASS — ${caught} mutations detected`);
  process.exit(0);
}

const failures = audit(fs.readFileSync(path.join(ROOT, FILE), "utf8"));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — CustomerDetail's ${CHECKS.length} tabs/actions are real, self-referential customer wiring`);
