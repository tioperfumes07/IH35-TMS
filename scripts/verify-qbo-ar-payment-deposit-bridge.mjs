#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pullerPath = path.join(root, "apps/backend/src/qbo-sync/qbo-ar-payments-puller.ts");
const postingPath = path.join(root, "apps/backend/src/accounting/posting-engine.service.ts");

export function analyze(puller, posting) {
  const failures = [];

  if (!/import\s+\{\s*resolveCustomerPaymentDepositAccount\s*\}\s+from\s+["']\.\.\/accounting\/posting-engine\.service\.js["']/.test(puller)) {
    failures.push("QBO AR payments puller must import the shared customer-payment deposit resolver.");
  }
  if (!/await\s+resolveCustomerPaymentDepositAccount\s*\(\s*client\s*,\s*operatingCompanyId\s*,\s*qboDepositAccountId\s*\)/.test(puller)) {
    failures.push("QBO AR payments puller must resolve DepositToAccountRef through the shared resolver.");
  }
  if (!/export\s+async\s+function\s+resolveCustomerPaymentDepositAccount\s*\(/.test(posting)) {
    failures.push("Posting engine must export resolveCustomerPaymentDepositAccount for inbound QBO reuse.");
  }
  if (!/resolveBankLedgerAccountId\s*\(\s*client\s*,\s*operatingCompanyId\s*,\s*raw\s*\)/.test(posting)) {
    failures.push("Shared customer-payment resolver lost its bank-to-ledger soft-resolve.");
  }
  if (!/return\s+resolveCashLikeAccountForCompany\s*\(\s*client\s*,\s*operatingCompanyId\s*\)/.test(posting)) {
    failures.push("Shared customer-payment resolver lost its cash-like fallback.");
  }

  return failures;
}

function replaceOnce(source, before, after) {
  if (!source.includes(before)) throw new Error(`selftest mutation target absent: ${before}`);
  return source.replace(before, after);
}

if (process.argv.includes("--selftest")) {
  const puller = fs.readFileSync(pullerPath, "utf8");
  const posting = fs.readFileSync(postingPath, "utf8");
  const missingImport = replaceOnce(
    puller,
    'import { resolveCustomerPaymentDepositAccount } from "../accounting/posting-engine.service.js";',
    ""
  );
  const missingCall = replaceOnce(
    puller,
    "await resolveCustomerPaymentDepositAccount(client, operatingCompanyId, qboDepositAccountId)",
    "qboDepositAccountId"
  );
  const missingBridge = replaceOnce(
    posting,
    "const bankLedger = await resolveBankLedgerAccountId(client, operatingCompanyId, raw);",
    "const bankLedger = null;"
  );
  const checks = {
    correctedShapePasses: analyze(puller, posting).length === 0,
    missingImportFails: analyze(missingImport, posting).length > 0,
    missingCallFails: analyze(missingCall, posting).length > 0,
    missingBridgeFails: analyze(puller, missingBridge).length > 0,
  };
  if (Object.values(checks).every(Boolean)) {
    console.log("verify-qbo-ar-payment-deposit-bridge --selftest: PASS");
    process.exit(0);
  }
  console.error("verify-qbo-ar-payment-deposit-bridge --selftest: FAIL", checks);
  process.exit(1);
}

const failures = analyze(fs.readFileSync(pullerPath, "utf8"), fs.readFileSync(postingPath, "utf8"));
if (failures.length) {
  console.error("verify-qbo-ar-payment-deposit-bridge: FAIL");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("verify-qbo-ar-payment-deposit-bridge: PASS");
