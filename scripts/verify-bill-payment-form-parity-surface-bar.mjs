#!/usr/bin/env node
/**
 * BANK-F3596 — BillPaymentForm apply grid must use ParityTable (Search+Range+gear),
 * not a raw HTML table (archived Workflow-B leaf).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/banking/components/forms/BillPaymentForm.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "BillPaymentForm: must use ParityTable");
  assert(src.includes('storageKey="bill-payment-form-apply"'), "BillPaymentForm: storageKey");
  assert(src.includes('tableTestId="bill-payment-form-apply-table"'), "BillPaymentForm: tableTestId");
  assert(src.includes("embedded"), "BillPaymentForm: ParityTable must be embedded");
  assert(src.includes("apply_amount_usd"), "BillPaymentForm: keep apply amount field");
  assert(!/<table\b/.test(src), "BillPaymentForm: must not use raw HTML table");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const planted = [
    "export function BillPaymentForm() {",
    '  return <table className="min-w-full" data-testid="bill-payment-form-apply-table"><tbody /></table>;',
    "}",
    "",
  ].join("\n");
  fs.writeFileSync(filePath, planted);
  let failed = false;
  try {
    check();
  } catch {
    failed = true;
  }
  fs.writeFileSync(filePath, good);
  assert(failed, "selftest: expected FAIL on raw HTML table");
  console.log("verify-bill-payment-form-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-bill-payment-form-parity-surface-bar PASS");
}
