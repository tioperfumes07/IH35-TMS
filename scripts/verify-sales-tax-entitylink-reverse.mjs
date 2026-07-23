#!/usr/bin/env node
/**
 * Rule-17 guard: sales tax forward EntityLinks + JE reverse mapping (Law §9).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-sales-tax-entitylink-reverse";
const SALES_TAX_PAGE = "apps/frontend/src/pages/accounting/SalesTaxPage.tsx";
const JE_DETAIL = "apps/frontend/src/pages/accounting/journal-entries/JournalEntryDetailPage.tsx";
const ENTITY_LINK = "apps/frontend/src/components/shared/EntityLink.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function assertSalesTaxEntitylinkReverse() {
  const errors = [];
  const salesTax = read(SALES_TAX_PAGE);
  const jeDetail = read(JE_DETAIL);
  const entityLink = read(ENTITY_LINK);

  if (!salesTax.includes("EntityLink")) {
    errors.push(`${SALES_TAX_PAGE}: must render EntityLink drill-through on returns/agencies`);
  }
  if (!/kind=["']vendor["']/.test(salesTax)) {
    errors.push(`${SALES_TAX_PAGE}: agency vendor must EntityLink kind=vendor`);
  }
  if (!/paid_bill_id/.test(salesTax) || !/kind=["']bill["']/.test(salesTax)) {
    errors.push(`${SALES_TAX_PAGE}: paid returns must EntityLink paid_bill_id → bill`);
  }
  if (!/case ["']sales_tax_return["']:/.test(jeDetail)) {
    errors.push(`${JE_DETAIL}: postingEntityKind must map sales_tax_return for JE reverse drill`);
  }
  if (!entityLink.includes("sales_tax_return") || !/\/accounting\/sales-tax/.test(entityLink)) {
    errors.push(`${ENTITY_LINK}: must resolve sales_tax_return → /accounting/sales-tax`);
  }
  return errors;
}

function selftest() {
  const errors = assertSalesTaxEntitylinkReverse();
  if (errors.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  ${errors.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = assertSalesTaxEntitylinkReverse();
if (errors.length) {
  console.error(`${LABEL} FAIL`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
