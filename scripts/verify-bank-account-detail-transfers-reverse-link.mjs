#!/usr/bin/env node
/**
 * BANK-F5794 — a bank account's transfer reverse list must stay scoped to the
 * selected company/account and drill to the exact human-labelled counter account.
 *
 * Self-test: node scripts/verify-bank-account-detail-transfers-reverse-link.mjs --selftest
 */
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/banking/BankAccountDetail.tsx";
const LABEL = "verify-bank-account-detail-transfers-reverse-link";

const CHECKS = [
  { name: "company/account scoped transfer query key", pattern: /queryKey:\s*\["banking", "transfers", "by-account", id, companyId\]/ },
  { name: "company/account scoped transfer read", pattern: /listTransfers\(companyId, \{ accountId: id, status: "active", limit: 50 \}\)/ },
  { name: "transfer read disabled without company and account", pattern: /listTransfers\(companyId, \{ accountId: id, status: "active", limit: 50 \}\),\s+enabled: Boolean\(id && companyId\)/ },
  { name: "direction derives from exact from-account FK", pattern: /t\.from_account_id === id \? "Out" : "In"/ },
  { name: "counter-account id derives from transfer direction", pattern: /const otherAccountId = isOutgoing \? t\.to_account_id : t\.from_account_id/ },
  { name: "counter-account kind derives from transfer direction", pattern: /const otherAccountKind = isOutgoing \? t\.to_account_kind : t\.from_account_kind/ },
  { name: "counter-account human label derives from scoped projections", pattern: /const otherAccountName = isOutgoing\s*\? t\.to_bank_name \|\| t\.to_coa_name\s*:\s*t\.from_bank_name \|\| t\.from_coa_name/ },
  { name: "counter-account drill uses canonical kind", pattern: /kind=\{otherAccountKind === "coa" \? "account" : "bank_account"\}/ },
  { name: "counter-account drill uses exact FK", pattern: /id=\{otherAccountId\}/ },
  { name: "counter-account drill uses human label", pattern: /label=\{entityLabel\(otherAccountName, otherAccountId, "Account"\)\}/ },
  { name: "reverse section is rendered from scoped rows", pattern: /transfers\.length > 0[\s\S]{0,220}data-testid="bank-account-detail-transfers"/ },
  { name: "reverse table preserves exact transfer row identity", pattern: /<ParityTable<Transfer>[\s\S]{0,220}rows=\{transfers\}[\s\S]{0,160}rowKey=\{\(t\) => t\.id\}/ },
];

export function collectFailures(src) {
  return CHECKS.filter(({ pattern }) => !pattern.test(src)).map(({ name }) => name);
}

const source = fs.readFileSync(FILE, "utf8");

if (process.argv.includes("--selftest")) {
  const baseline = collectFailures(source);
  if (baseline.length) {
    console.error(`[${LABEL}] SELFTEST baseline FAIL:\n- ${baseline.join("\n- ")}`);
    process.exit(1);
  }
  let rejected = 0;
  const inert = [];
  for (const check of CHECKS) {
    const planted = source.replace(check.pattern, "/* planted BANK-F5794 reverse defect */");
    if (planted !== source && collectFailures(planted).includes(check.name)) rejected += 1;
    else inert.push(check.name);
  }
  if (rejected !== CHECKS.length) {
    console.error(`[${LABEL}] SELFTEST FAIL: rejected ${rejected}/${CHECKS.length} independent plants; inert: ${inert.join(", ")}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] --selftest PASS: rejected ${rejected}/${CHECKS.length} independent account-transfer plants`);
  process.exit(0);
}

const failures = collectFailures(source);
if (failures.length) {
  console.error(`[${LABEL}] FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`[${LABEL}] PASS: ${CHECKS.length} exact account-transfer reverse obligations ratcheted`);
