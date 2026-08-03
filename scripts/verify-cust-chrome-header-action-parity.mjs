#!/usr/bin/env node
/**
 * CUST-CHROME-01 / CUST-CHROME-02 — Customers (and Vendors sibling) header Edit
 * must share Button chrome with "New transaction" on the same row — not ActionButton
 * text-link (24×16 vs ~98×42).
 *
 *   node scripts/verify-cust-chrome-header-action-parity.mjs
 *   node scripts/verify-cust-chrome-header-action-parity.mjs --selftest
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const LABEL = "verify-cust-chrome-header-action-parity";

const CUSTOMERS = "apps/frontend/src/pages/Customers.tsx";
const VENDORS = "apps/frontend/src/pages/Vendors.tsx";

function sliceAround(src, marker, before = 250, after = 120) {
  const i = src.indexOf(marker);
  if (i < 0) return "";
  return src.slice(Math.max(0, i - before), i + marker.length + after);
}

function assert(files) {
  const problems = [];
  const cust = files[CUSTOMERS] ?? "";
  const vend = files[VENDORS] ?? "";

  if (!cust.includes('data-testid="customer-header-edit"')) {
    problems.push(`${CUSTOMERS}: missing data-testid=customer-header-edit`);
  }
  if (!cust.includes('data-testid="customer-header-new-transaction"')) {
    problems.push(`${CUSTOMERS}: missing data-testid=customer-header-new-transaction`);
  }
  if (!cust.includes('data-testid="customer-header-actions"')) {
    problems.push(`${CUSTOMERS}: missing data-testid=customer-header-actions`);
  }

  const editWin = sliceAround(cust, 'data-testid="customer-header-edit"', 180, 40);
  if (editWin) {
    if (/<ActionButton\b/.test(editWin)) {
      problems.push(`${CUSTOMERS}: header Edit must not use ActionButton`);
    }
    if (!/variant="secondary"/.test(editWin)) {
      problems.push(`${CUSTOMERS}: header Edit must be Button variant=secondary`);
    }
    if (!/\bh-8\b/.test(editWin)) {
      problems.push(`${CUSTOMERS}: header Edit must use className h-8 to match primary New transaction height`);
    }
  }

  const detailsWin = sliceAround(cust, 'data-testid="customer-details-edit"', 120, 40);
  if (!detailsWin) {
    problems.push(`${CUSTOMERS}: missing data-testid=customer-details-edit`);
  } else if (!/variant="secondary"/.test(detailsWin) || !/<Button\b/.test(detailsWin)) {
    problems.push(`${CUSTOMERS}: customer-details-edit must be Button variant=secondary`);
  } else if (/<ActionButton\b/.test(detailsWin)) {
    problems.push(`${CUSTOMERS}: customer-details-edit must not use ActionButton`);
  }

  if (!vend.includes('data-testid="vendor-header-edit"')) {
    problems.push(`${VENDORS}: missing data-testid=vendor-header-edit (CLS-CHROME sibling)`);
  }
  const vendWin = sliceAround(vend, 'data-testid="vendor-header-edit"');
  if (vendWin && /<ActionButton\b/.test(vendWin)) {
    problems.push(`${VENDORS}: header Edit must not use ActionButton`);
  }
  if (vendWin && !/variant="secondary"/.test(vendWin)) {
    problems.push(`${VENDORS}: header Edit must be Button variant=secondary`);
  }

  return problems;
}

const files = Object.fromEntries(
  [CUSTOMERS, VENDORS].map((rel) => [rel, readFileSync(path.join(ROOT, rel), "utf8")]),
);

if (SELFTEST) {
  const planted = {
    ...files,
    [CUSTOMERS]: files[CUSTOMERS]
      .replace(/data-testid="customer-header-edit"/g, 'data-testid="gone"')
      .replace(
        /variant="secondary"\s*\n\s*className="h-8"\s*\n\s*onClick=\{\(\) => navigate\(`\/customers\/\$\{selectedCustomer\.id\}`\)\}\s*\n\s*data-testid="gone"/,
        'data-testid="gone"',
      ),
  };
  // Stronger plant: strip secondary near details + remove header edit id
  planted[CUSTOMERS] = files[CUSTOMERS].replace(/data-testid="customer-header-edit"/g, 'data-testid="x"');
  const caught = assert(planted);
  if (!caught.some((p) => p.includes("customer-header-edit"))) {
    console.error(`${LABEL} SELFTEST FAIL — missing header-edit not caught`, caught);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assert(files);
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(`${LABEL}: OK — Customers/Vendors header Edit shares Button chrome with New transaction`);
process.exit(0);
