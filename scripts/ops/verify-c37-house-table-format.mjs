#!/usr/bin/env node
/**
 * C-37 — THE HOUSE TABLE FORMAT (Round 300 #3).
 * Right-aligned tabular-nums, accounting parentheses negatives, missing → "—",
 * row lines only (no left/right cell borders), zebra even rows, sticky header, pinned totals.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fail = (m) => {
  console.error(`FAIL: ${m}`);
  process.exit(1);
};
const ok = (m) => console.log(`PASS: ${m}`);
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

if (!process.argv.includes("--selftest")) {
  console.log("usage: node scripts/ops/verify-c37-house-table-format.mjs --selftest");
  process.exit(0);
}

const money = read("apps/frontend/src/lib/money.ts");
const parity = read("apps/frontend/src/components/parity/ParityTable.tsx");
const tableMoney = read("apps/frontend/src/components/table/TableMoneyCell.tsx");

if (!money.includes("function usdFormatNoNegativeZero")) fail("money.ts must keep usdFormatNoNegativeZero");
ok("C-37 usdFormatNoNegativeZero retained");

for (const needle of [
  'export const TABLE_MISSING = "—"',
  "formatUsdCentsTable",
  "formatUsdTable",
  "formatNumberTable",
  "formatAccountingDollars(",
  "TABLE_MONEY_NEGATIVE_CLASS",
  "isNegativeMoneyCents",
]) {
  if (!money.includes(needle)) fail(`money.ts missing C-37 contract ${needle}`);
}
ok("C-37 money.ts table formatters present");

if (!tableMoney.includes("TableMoneyCell") || !tableMoney.includes("formatUsdCentsTable")) {
  fail("TableMoneyCell must render via formatUsdCentsTable");
}
if (!tableMoney.includes("TABLE_MONEY_NEGATIVE_CLASS")) {
  fail("TableMoneyCell must redden accounting negatives");
}
ok("C-37 TableMoneyCell wired");

if (!/stickyHeader\s*=\s*true/.test(parity)) {
  fail("ParityTable stickyHeader must default true");
}
if (!parity.includes('className={stickyHeader ? "sticky top-0 z-10" : ""}')) {
  fail("ParityTable thead must use sticky top-0 when stickyHeader");
}
ok("C-37 sticky header default");

if (!parity.includes("QBO_SURFACE.rowStripe") || !parity.includes("isEvenRow")) {
  fail("ParityTable must zebra-stripe even rows");
}
ok("C-37 zebra even rows");

if (!parity.includes("data-c37-pinned-footer") || !parity.includes("sticky bottom-0")) {
  fail("ParityTable footerCells tfoot must be sticky bottom (pinned totals)");
}
ok("C-37 pinned totals row");

if (!parity.includes("parityMergedCellClass") || !parity.includes("QBO_MONEY_CELL_CLASS")) {
  fail("ParityTable must merge QBO_MONEY_CELL_CLASS for numeric columns");
}
if (!parity.includes("TableMoneyCell")) fail("ParityTable must auto-render _cents via TableMoneyCell");
ok("C-37 ParityTable numeric/money defaults");

// C-37 — no left/right borders on th/td (row lines only).
if (/borderLeft:\s*`1px solid \$\{colors\.tableColumnRule\}`/.test(parity)) {
  fail("ParityTable th/td still declare borderLeft — C-37 forbids vertical rules");
}
if (/borderRight:\s*`1px solid \$\{colors\.table(ColumnRule|BodyRule)\}`/.test(parity)) {
  fail("ParityTable th/td still declare borderRight — C-37 forbids vertical rules");
}
if (/\b(?:th|td)[^>]*className=\{?`[^`]*\bborder-[lr]\b/.test(parity)) {
  fail("ParityTable th/td className still carries border-l/border-r");
}
ok("C-37 no vertical cell borders in ParityTable");

console.log("verify-c37-house-table-format --selftest OK");
