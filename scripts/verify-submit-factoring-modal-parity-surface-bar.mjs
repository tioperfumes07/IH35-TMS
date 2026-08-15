#!/usr/bin/env node
/**
 * ACCT-F3592 — SubmitFactoringModal candidate-invoice grid must use ParityTable
 * (Search+Range+gear + selectable), not a raw HTML table.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/accounting/SubmitFactoringModal.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "SubmitFactoringModal: must use ParityTable");
  assert(src.includes('storageKey="submit-factoring-modal-candidates"'), "SubmitFactoringModal: storageKey");
  assert(src.includes('tableTestId="submit-factoring-candidates-table"'), "SubmitFactoringModal: tableTestId");
  assert(src.includes("embedded"), "SubmitFactoringModal: ParityTable must be embedded");
  assert(src.includes("selectable"), "SubmitFactoringModal: must keep selectable invoice pick");
  assert(src.includes("onSelectionChange={setSelectedInvoiceIds}"), "SubmitFactoringModal: selection wired");
  assert(src.includes('kind="invoice"'), "SubmitFactoringModal: keep invoice drill link");
  assert(!/<table\b/.test(src), "SubmitFactoringModal: must not use raw HTML table");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const planted = [
    "export function SubmitFactoringModal() {",
    '  return <table className="min-w-full" data-testid="submit-factoring-candidates-table"><tbody /></table>;',
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
  console.log("verify-submit-factoring-modal-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-submit-factoring-modal-parity-surface-bar PASS");
}
