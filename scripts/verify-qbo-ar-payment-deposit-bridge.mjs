#!/usr/bin/env node
/**
 * verify-qbo-ar-payment-deposit-bridge — AR payment projection must map
 * DepositToAccountRef → catalogs.accounts (postable) in the set-based SQL path.
 *
 * History: PR #3429 wired per-row resolveCustomerPaymentDepositAccount. That pattern
 * held a long txn (idle_in_transaction FATAL). Projection is now set-based
 * (PR #3433); deposit resolve is LEFT JOIN catalogs.accounts on qbo_account_id
 * + is_postable. The shared JS resolver remains exported from posting-engine for
 * TMS customer-payment write paths — not required inside the QBO projector loop.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pullerPath = path.join(root, "apps/backend/src/qbo-sync/qbo-ar-payments-puller.ts");
const postingPath = path.join(root, "apps/backend/src/accounting/posting-engine.service.ts");

export function analyze(puller, posting) {
  const failures = [];
  const projectFn = puller.includes("export async function projectArPaymentsToLedger")
    ? puller.slice(puller.indexOf("export async function projectArPaymentsToLedger"))
    : "";

  if (!projectFn) {
    failures.push("qbo-ar-payments-puller.ts missing projectArPaymentsToLedger.");
    return failures;
  }

  // Set-based deposit bridge: join CoA by qbo_account_id, postable only.
  if (!/LEFT\s+JOIN\s+catalogs\.accounts\s+dep/i.test(projectFn)) {
    failures.push(
      "projectArPaymentsToLedger must LEFT JOIN catalogs.accounts dep for DepositToAccountRef (set-based deposit bridge)."
    );
  }
  if (!/dep\.qbo_account_id\s*=\s*m\.deposit_to_account_qbo_id/i.test(projectFn)) {
    failures.push("deposit bridge must match dep.qbo_account_id = m.deposit_to_account_qbo_id.");
  }
  if (!/dep\.is_postable\s*=\s*true/i.test(projectFn)) {
    failures.push("deposit bridge must require dep.is_postable = true (never header/non-postable CoA).");
  }
  if (!/deposited_to_account_id\s*=\s*dep\.id/i.test(projectFn) && !/n\.deposited_to_account_id/i.test(projectFn)) {
    failures.push("projection must write deposited_to_account_id from the CoA deposit join.");
  }
  // Must NOT reintroduce per-row JS resolver inside the long projection (idle_in_transaction).
  if (/await\s+resolveCustomerPaymentDepositAccount\s*\(/.test(projectFn)) {
    failures.push(
      "projectArPaymentsToLedger must not await resolveCustomerPaymentDepositAccount per row — that caused idle_in_transaction FATAL; use set-based CoA join."
    );
  }

  // Shared resolver still exists for TMS receive-payment paths.
  if (!/export\s+async\s+function\s+resolveCustomerPaymentDepositAccount\s*\(/.test(posting)) {
    failures.push("Posting engine must export resolveCustomerPaymentDepositAccount for TMS customer-payment paths.");
  }
  if (!/resolveBankLedgerAccountId\s*\(\s*client\s*,\s*operatingCompanyId\s*,\s*raw\s*\)/.test(posting)) {
    failures.push("Shared customer-payment resolver lost its bank-to-ledger soft-resolve.");
  }
  if (!/return\s+resolveCashLikeAccountForCompany\s*\(\s*client\s*,\s*operatingCompanyId\s*\)/.test(posting)) {
    failures.push("Shared customer-payment resolver lost its cash-like fallback.");
  }

  return failures;
}

function replaceAll(source, before, after) {
  if (!source.includes(before)) throw new Error(`selftest mutation target absent: ${before}`);
  return source.split(before).join(after);
}

if (process.argv.includes("--selftest")) {
  const puller = fs.readFileSync(pullerPath, "utf8");
  const posting = fs.readFileSync(postingPath, "utf8");
  const missingJoin = replaceAll(puller, "LEFT JOIN catalogs.accounts dep", "LEFT JOIN catalogs.accounts other_alias");
  const missingPostable = replaceAll(puller, "AND dep.is_postable = true", "AND dep.deactivated_at IS NULL /* no postable */");
  const missingBridge = replaceAll(
    posting,
    "const bankLedger = await resolveBankLedgerAccountId(client, operatingCompanyId, raw);",
    "const bankLedger = null;"
  );
  const checks = {
    correctedShapePasses: analyze(puller, posting).length === 0,
    missingJoinFails: analyze(missingJoin, posting).length > 0,
    missingPostableFails: analyze(missingPostable, posting).length > 0,
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

console.log("verify-qbo-ar-payment-deposit-bridge: PASS (set-based CoA deposit join; TMS resolver retained in posting-engine)");
