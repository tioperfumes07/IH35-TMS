#!/usr/bin/env node
/** LST-F119 — InvoiceDetail + MaintenanceShopHub + Bills deep-link: no UUID-slice chrome. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  "apps/frontend/src/pages/accounting/InvoiceDetailPage.tsx",
  "apps/frontend/src/pages/accounting/MaintenanceShopHubPage.tsx",
  "apps/frontend/src/pages/accounting/BillsPage.tsx",
  "apps/backend/src/accounting/maintenance-shop.service.ts",
];
const LABEL = "verify-invoice-maint-shop-human-labels";
const SELFTEST = process.argv.includes("--selftest");

function assertAll(srcs) {
  const problems = [];
  for (const [file, src] of Object.entries(srcs)) {
    if (/highlightedBillId\.slice\(0,\s*8\)/.test(src)) {
      problems.push(`${file}: bills deep-link still UUID-slices`);
    }
    if (/work_order_id\.slice\(0,\s*8\)/.test(src) || /financial_id\.slice\(0,\s*8\)/.test(src)) {
      problems.push(`${file}: maint shop still UUID-slices`);
    }
    if (/jeId\.slice\(0,\s*8\)/.test(src) || /journal_entry_id\.slice\(0,\s*8\)/.test(src)) {
      problems.push(`${file}: invoice JE still UUID-slices`);
    }
    if (
      file.endsWith("MaintenanceShopHubPage.tsx") &&
      !/visibleDocumentLabel\(row\.financial_label, row\.financial_id, "No expense #"\)/.test(src)
    ) {
      problems.push(`${file}: expense drill must use visibleDocumentLabel — empty expense_number is No expense #, not Expense — not visible`);
    }
    if (
      file.endsWith("MaintenanceShopHubPage.tsx") &&
      !/visibleDocumentLabel\(row\.financial_label, row\.financial_id, "No bill #"\)/.test(src)
    ) {
      problems.push(`${file}: bill drill must use visibleDocumentLabel — empty bill_number is No bill #, not Record — not visible`);
    }
    if (file.endsWith("maintenance-shop.service.ts") && !/e\.expense_number AS financial_label/.test(src)) {
      problems.push(`${file}: expense query must project canonical expense_number`);
    }
    if (!file.endsWith("maintenance-shop.service.ts") && !/entityLabel\(/.test(src)) {
      problems.push(`${file}: missing entityLabel`);
    }
  }
  return problems;
}

const read = () => Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]));

if (SELFTEST) {
  const srcs = read();
  const mutations = [
    [FILES[2], /entityLabel\(rows\.find[\s\S]*?highlightedBillId,\s*"Bill"\)/, "highlightedBillId.slice(0, 8)"],
    [FILES[1], 'visibleDocumentLabel(row.financial_label, row.financial_id, "No expense #")', 'entityLabel(row.financial_label, row.financial_id, "Expense")'],
    [FILES[3], "e.expense_number AS financial_label", "NULL::text AS financial_label"],
  ];
  for (const [file, pattern, replacement] of mutations) {
    const planted = { ...srcs, [file]: srcs[file].replace(pattern, replacement) };
    if (planted[file] === srcs[file] || !assertAll(planted).length) {
      console.error(`${LABEL} SELFTEST FAILED: planted defect not caught in ${file}`);
      process.exit(1);
    }
  }
  const live = assertAll(srcs);
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertAll(read());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
