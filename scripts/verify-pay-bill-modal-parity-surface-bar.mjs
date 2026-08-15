#!/usr/bin/env node
/**
 * ACCT-F3588 — PayBillModal apply-to-bill grid must use ParityTable (Search+Range+gear),
 * not a raw HTML table.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/accounting/PayBillModal.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "PayBillModal: must use ParityTable");
  assert(src.includes('storageKey="pay-bill-modal-apply"'), "PayBillModal: apply storageKey");
  assert(src.includes('tableTestId="pay-bill-apply-table"'), "PayBillModal: tableTestId");
  assert(src.includes("embedded"), "PayBillModal: ParityTable must be embedded");
  assert(src.includes("MoneyInput"), "PayBillModal: keep MoneyInput on Apply");
  assert(src.includes('kind="bill"'), "PayBillModal: keep bill EntityLink");
  assert(!/<table\b/.test(src), "PayBillModal: must not use raw HTML table");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const planted = [
    "export function PayBillModal() {",
    '  return <table className="min-w-full" data-testid="pay-bill-apply-table"><tbody /></table>;',
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
  console.log("verify-pay-bill-modal-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-pay-bill-modal-parity-surface-bar PASS");
}
