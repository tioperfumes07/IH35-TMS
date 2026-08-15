#!/usr/bin/env node
/**
 * ACCT-F3594 — InvoiceCreateModal from-load pick list must use ParityTable
 * (Search+Range+gear), not a raw HTML table.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/accounting/InvoiceCreateModal.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "InvoiceCreateModal: must use ParityTable");
  assert(src.includes('storageKey="invoice-create-modal-from-load"'), "InvoiceCreateModal: storageKey");
  assert(src.includes('tableTestId="invoice-create-from-load-table"'), "InvoiceCreateModal: tableTestId");
  assert(src.includes("embedded"), "InvoiceCreateModal: ParityTable must be embedded");
  assert(src.includes("createFromLoad"), "InvoiceCreateModal: keep createFromLoad Select action");
  assert(!/<table\b/.test(src), "InvoiceCreateModal: must not use raw HTML table");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const planted = [
    "export function InvoiceCreateModal() {",
    '  return <table className="w-full" data-testid="invoice-create-from-load-table"><tbody /></table>;',
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
  console.log("verify-invoice-create-modal-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-invoice-create-modal-parity-surface-bar PASS");
}
