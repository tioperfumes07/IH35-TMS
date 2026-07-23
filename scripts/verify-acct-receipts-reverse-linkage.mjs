#!/usr/bin/env node
/**
 * verify-acct-receipts-reverse-linkage.mjs — Accounting Full Audit 22/22
 *
 * Receipts list + detail must drill via EntityLink to bill/expense detail routes,
 * and receipt detail must use ParityDrawer (not centered modal shell).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-receipts-reverse-linkage";
const PAGE = "apps/frontend/src/pages/accounting/ReceiptsPage.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function check() {
  const failures = [];
  const page = read(PAGE);

  if (!/EntityLink/.test(page)) failures.push(`${PAGE}: must use EntityLink for bill/expense drill-through`);
  // Kind must be resolved from the source type for ALL THREE types. The old assertion hardcoded the
  // two-branch form `type === "expense" ? "expense" : "bill"`, which sends a PAYMENT receipt to
  // /accounting/bills/<payment_id> — a wrong-record drill — and blocked the correct resolver.
  if (!/kind=\{receiptEntityKind\(row\)\}/.test(page)) {
    failures.push(`${PAGE}: list Ref # column must resolve EntityLink kind via receiptEntityKind(row)`);
  }
  if (!/case[\s\S]{0,0}|receiptEntityKind/.test(page) || !/"payment"/.test(page)) {
    failures.push(`${PAGE}: receiptEntityKind must map payment receipts to the payment kind, not bill`);
  }
  if (!/id=\{row\.entity_id\}/.test(page)) failures.push(`${PAGE}: list must pass entity_id to EntityLink`);
  if (!/id=\{data\.entity_id\}/.test(page)) failures.push(`${PAGE}: detail panel must EntityLink data.entity_id`);
  if (!/<ParityDrawer/.test(page)) failures.push(`${PAGE}: ReceiptDetailPanel must use ParityDrawer`);
  if (/fixed inset-0 z-40 flex items-center justify-center/.test(page)) {
    failures.push(`${PAGE}: centered modal shell forbidden on receipt detail`);
  }
  if (/detail_path/.test(page)) failures.push(`${PAGE}: must not rely on raw detail_path Link (use EntityLink)`);
  return failures;
}

if (process.argv.includes("--selftest")) {
  if (check().length) {
    console.error(`${LABEL} --selftest FAIL on live tree`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const failures = check();
if (failures.length) {
  console.error(`${LABEL} FAIL:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
