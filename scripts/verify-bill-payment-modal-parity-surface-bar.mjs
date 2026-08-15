#!/usr/bin/env node
/**
 * ACCT-F3590 — BillPaymentModal open-bills grid must use ParityTable (Search+Range+gear),
 * not a raw HTML table.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/components/ap/BillPaymentModal.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "BillPaymentModal: must use ParityTable");
  assert(src.includes('storageKey="bill-payment-modal-open-bills"'), "BillPaymentModal: storageKey");
  assert(src.includes('tableTestId="bill-payment-open-bills-table"'), "BillPaymentModal: tableTestId");
  assert(src.includes("embedded"), "BillPaymentModal: ParityTable must be embedded");
  assert(src.includes("selectable={!autoApply}"), "BillPaymentModal: selectable when manual apply");
  assert(src.includes("MoneyInput"), "BillPaymentModal: keep MoneyInput on Apply");
  assert(!/<table\b/.test(src), "BillPaymentModal: must not use raw HTML table");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const planted = [
    "export function BillPaymentModal() {",
    '  return <table className="min-w-full" data-testid="bill-payment-open-bills-table"><tbody /></table>;',
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
  console.log("verify-bill-payment-modal-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-bill-payment-modal-parity-surface-bar PASS");
}
