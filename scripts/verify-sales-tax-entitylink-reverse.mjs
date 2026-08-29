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
  // ACCT-F5063 — CLS-LINKAGE-ONEWAY: paid bill label must use joined paid_bill_number.
  // RE-ANCHOR (found stale 2026-08-29): SalesTaxPage.tsx moved from entityLabel to its documented
  // list/register successor visibleDocumentLabel (apps/frontend/src/lib/entity-label.ts) -- same
  // UUID-shaped-name rejection guarantee, plus it also rejects "Unknown ..." names and never claims
  // "not visible" on a row that IS visible (its own doc comment). Accept either spelling.
  if (
    !/(?:entityLabel|visibleDocumentLabel)\(\s*row\.paid_bill_number\s*,\s*row\.paid_bill_id\s*,\s*["']Bill["']\s*\)/.test(
      salesTax,
    )
  ) {
    errors.push(`${SALES_TAX_PAGE}: paid bill EntityLink must entityLabel/visibleDocumentLabel(row.paid_bill_number, …)`);
  }
  if (/(?:entityLabel|visibleDocumentLabel)\(\s*null\s*,\s*row\.paid_bill_id\s*,\s*["']Bill["']\s*\)/.test(salesTax)) {
    errors.push(`${SALES_TAX_PAGE}: must not entityLabel/visibleDocumentLabel(null, paid_bill_id) — UUID chrome`);
  }
  const routes = read("apps/backend/src/accounting/sales-tax/routes.ts");
  if (!/b\.bill_number AS paid_bill_number/.test(routes) || !/LEFT JOIN accounting\.bills b/.test(routes)) {
    errors.push("sales-tax/routes: returns list must LEFT JOIN bills for paid_bill_number");
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

// The link is only real if the TARGET PAGE consumes the param. Asserting only that EntityLink
// contains the route string certified a dead ?return_id= as done — a guard that freezes a cosmetic
// link is worse than no guard.
const salesTaxPage = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/accounting/SalesTaxPage.tsx"), "utf8");
if (!/useSearchParams/.test(salesTaxPage) || !/searchParams\.get\("return_id"\)/.test(salesTaxPage)) {
  console.error("FAIL: SalesTaxPage must read searchParams return_id — EntityLink kind=sales_tax_return resolves to ?return_id= and a page that ignores it makes the drill-through cosmetic");
  process.exit(1);
}
if (!/highlightReturnId/.test(salesTaxPage)) {
  console.error("FAIL: SalesTaxPage must USE the return_id it reads (row highlight) — reading it without acting on it is still a dead link");
  process.exit(1);
}

console.log(`${LABEL} PASS`);
