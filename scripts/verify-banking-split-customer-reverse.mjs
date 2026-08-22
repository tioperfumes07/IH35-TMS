#!/usr/bin/env node
/**
 * BANK-F5818 — split lines persist customer_id, so the shared linked-bank panel must return them
 * through the same selected-company customer reverse surface as ordinary categorization rows.
 * @matrix-built {"modules":["banking"],"cols":["reverse_link"],"leaves":["banking.panel.linked_bank_transactions"],"task":"BANK-F5818","vertical":"column-wave"}
 */
import fs from "node:fs";

const LABEL = "verify-banking-split-customer-reverse";
const FILES = {
  service: "apps/backend/src/banking/bank-transaction-splits.service.ts",
  route: "apps/backend/src/banking/categorization.routes.ts",
  api: "apps/frontend/src/api/banking.ts",
  panel: "apps/frontend/src/components/banking/LinkedBankTransactionsPanel.tsx",
  matrix: "docs/specs/scoreboard/modules/banking.required.json",
};
const checks = [
  ["service", /linkage: \{[^}]*customer_id\?: string/, "service linkage accepts customer_id"],
  ["service", /s\.customer_id::text/, "service projects the canonical customer FK"],
  ["service", /\$7::uuid IS NOT NULL AND s\.customer_id = \$7::uuid/, "service filters the exact customer FK"],
  ["service", /linkage\.customer_id \?\? null, limit\]/, "service binds customer_id before limit"],
  ["route", /transaction-splits\/by-linkage[\s\S]{0,800}customer_id: z\.string\(\)\.uuid\(\)\.optional\(\)/, "route validates customer_id"],
  ["route", /transaction-splits\/by-linkage[\s\S]{0,1100}const provided = \[[^\]]*q\.data\.customer_id/, "route enforces exactly-one including customer"],
  ["route", /transaction-splits\/by-linkage[\s\S]{0,1800}customer_id: q\.data\.customer_id/, "route forwards customer_id"],
  ["api", /getBankTransactionSplitsByLinkage\([\s\S]{0,260}customer_id\?: string/, "client accepts customer_id"],
  ["api", /getBankTransactionSplitsByLinkage\([\s\S]{0,800}if \(linkage\.customer_id\) params\.set\("customer_id", linkage\.customer_id\)/, "client serializes customer_id"],
  ["panel", /getBankTransactionSplitsByLinkage\(companyId,[\s\S]{0,160}\[linkage\.kind\]: linkage\.id/, "shared panel reads splits by its exact linkage"],
  ["panel", /data-testid="linked-bank-split-lines"/, "shared panel renders returned split lines"],
  ["panel", /data-testid="linked-bank-split-lines"[\s\S]{0,900}kind="bank_transaction"[\s\S]{0,100}id=\{row\.bank_transaction_id\}/, "split row drills to its parent bank transaction"],
  ["panel", /data-testid="linked-bank-split-lines"[\s\S]{0,1800}row\.result_journal_entry_id \? <EntityLink kind="journal_entry" id=\{row\.result_journal_entry_id\}/, "split row drills to its posted JE"],
  ["matrix", /"id": "banking\.panel\.linked_bank_transactions"[\s\S]{0,420}"reverse_link"/, "exact Required leaf owns reverse_link"],
];

function sources() {
  return Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
}
function audit(src) {
  return checks.filter(([key, pattern]) => !pattern.test(src[key])).map(([, , message]) => message);
}

const live = sources();
const failures = audit(live);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
if (process.argv.includes("--selftest")) {
  for (const [key, pattern, message] of checks) {
    const planted = live[key].replace(pattern, "/* planted BANK-F5818 defect */");
    if (planted === live[key] || !audit({ ...live, [key]: planted }).includes(message)) {
      console.error(`${LABEL} SELFTEST FAIL — plant escaped: ${message}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${checks.length}/${checks.length} production/matrix defects rejected`);
  process.exit(0);
}
console.log(`${LABEL} PASS — customer-coded split lines return through the canonical shared banking reverse panel`);
