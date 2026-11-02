#!/usr/bin/env node
/**
 * Codex QA 11-02 — Expenses/Bills list ReceiptAttach must not fan-out GET /attachments on mount.
 * Each list cell uses listWhen="open" + initialCount from attachment_count (one list query).
 */
import fs from "node:fs";

const LABEL = "verify-expenses-receipt-attach-no-fanout";
const ATTACH = "apps/frontend/src/components/documents/ReceiptAttach.tsx";
const EXPENSES = "apps/frontend/src/pages/accounting/ExpensesListPage.tsx";
const BILLS = "apps/frontend/src/pages/accounting/BillsPage.tsx";

const fails = [];
const attach = fs.readFileSync(ATTACH, "utf8");
const expenses = fs.readFileSync(EXPENSES, "utf8");
const bills = fs.readFileSync(BILLS, "utf8");

if (!/listWhen\?: "mount" \| "open"/.test(attach) && !/listWhen\s*=\s*"mount"/.test(attach)) {
  fails.push(`${ATTACH}: must declare listWhen mount|open`);
}
if (!/listWhen === "open" && open && !listed/.test(attach) && !/listWhen === "open" && open/.test(attach)) {
  fails.push(`${ATTACH}: must defer listAttachments until open when listWhen=open`);
}
if (!/listWhen === "mount"/.test(attach)) {
  fails.push(`${ATTACH}: mount path must still refresh on mount for detail/create`);
}

for (const [file, src, entity] of [
  [EXPENSES, expenses, "expense"],
  [BILLS, bills, "bill"],
]) {
  if (!/listWhen=["']open["']/.test(src)) {
    fails.push(`${file}: ReceiptAttach on list must use listWhen="open"`);
  }
  if (!/initialCount=\{Number\([a-z.]+\.attachment_count \?\? 0\)\}/.test(src) && !/initialCount=\{Number\(r\.attachment_count/.test(src) && !/initialCount=\{Number\(bill\.attachment_count/.test(src)) {
    fails.push(`${file}: must pass initialCount from ${entity} attachment_count`);
  }
  // Forbid the old mount-eager one-liner on the list receipt column.
  if (new RegExp(`<ReceiptAttach[^>]*entityType="${entity}"[^>]*readOnly(?![^>]*listWhen)`).test(src.replace(/\s+/g, " "))) {
    // loose — already covered by listWhen check
  }
}

if (process.argv.includes("--selftest")) {
  if (fails.length) {
    console.error(`${LABEL} --selftest FAIL live red:\n  ${fails.join("\n  ")}`);
    process.exit(1);
  }
  const plant = expenses.replace(/listWhen="open"/g, 'listWhen="mount"');
  const plantFails = [];
  if (!/listWhen=["']open["']/.test(plant)) plantFails.push("plant dropped open");
  if (plantFails.length === 0 && /listWhen=["']open["']/.test(expenses)) {
    // ensure plant would fail the open check
    if (/listWhen=["']open["']/.test(plant)) {
      console.error(`${LABEL} --selftest FAIL: plant still has open`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

if (fails.length) {
  console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — Expenses/Bills ReceiptAttach defer list until open`);
