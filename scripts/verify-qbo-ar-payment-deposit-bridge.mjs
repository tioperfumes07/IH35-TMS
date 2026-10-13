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

  // ACCT-F4431380 (Lead 443.137 item 9e) — OLD: projectArPaymentsToLedger had to carry the set-based deposit
  //   bridge (LEFT JOIN catalogs.accounts dep on qbo_account_id + is_postable, writing deposited_to_account_id)
  //   and must not await resolveCustomerPaymentDepositAccount per row.
  //   NEW: there is no QBO projection to bridge — projectArPaymentsToLedger must REFUSE BY NAME
  //   (refuseQboNativeWrite) and the puller must write no native accounting.* table (payments,
  //   payment_applications, deposits). The deposit resolver lives only in the TMS posting engine (kept below).
  //   WHY: QuickBooks is a read-only archive; the projection/write was removed and its entry point refuses by name.
  if (!/^export async function projectArPaymentsToLedger[^\n]*\n[\s\S]{0,300}?refuseQboNativeWrite\(/m.test(projectFn)) {
    failures.push("projectArPaymentsToLedger must refuse by name (refuseQboNativeWrite) — no QBO deposit bridge / projection.");
  }
  if (/(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+accounting\.(?!qbo_)[a-z_]+/i.test(puller)) {
    failures.push("qbo-ar-payments-puller.ts must not write any native accounting.* table (QuickBooks is a read-only archive).");
  }
  if (/resolveCustomerPaymentDepositAccount\s*\(/.test(projectFn)) {
    failures.push("projectArPaymentsToLedger must not resolve a deposit account — it no longer projects anything.");
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
  // ACCT-F4431380 (9e) plants on the REAL puller: a re-added native payment write and a reverted refusal must fail.
  const nativeWrite = puller + "\nconst P = `UPDATE accounting.payments SET deposited_to_account_id = $2 WHERE id = $1`;\n";
  const refusalReverted = replaceAll(puller, "refuseQboNativeWrite(", "noop(");
  const missingBridge = replaceAll(
    posting,
    "const bankLedger = await resolveBankLedgerAccountId(client, operatingCompanyId, raw);",
    "const bankLedger = null;"
  );
  const checks = {
    correctedShapePasses: analyze(puller, posting).length === 0,
    nativeWriteFails: analyze(nativeWrite, posting).length > 0,
    refusalRevertedFails: analyze(refusalReverted, posting).length > 0,
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

console.log("verify-qbo-ar-payment-deposit-bridge: PASS (QBO payment projection refuses by name — no deposit bridge from QuickBooks; TMS resolver retained in posting-engine)");
