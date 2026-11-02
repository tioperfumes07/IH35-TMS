#!/usr/bin/env node
/**
 * FAC-09a Purchase Report — Filter by Debtor must be wired (EntityMultiSelect + pr_customer_ids URL).
 * Previously noted in-page as "not wired this pass".
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factoring-purchase-report-debtor-filter";
const FILE = "apps/frontend/src/pages/factoring/FactoringHome.tsx";

function audit(src) {
  const fails = [];
  for (const needle of [
    'searchParams.get("pr_customer_ids")',
    'p.set("pr_customer_ids"',
    "factoring-purchase-report-debtor-filter",
    'kind="customer"',
    "purchaseReportDebtorIds",
    "Filter by Debtor",
  ]) {
    if (!src.includes(needle)) fails.push(`${FILE}: missing ${JSON.stringify(needle)}`);
  }
  if (/Filter by Debtor["'] are not wired/.test(src) || /"Filter by Debtor" are not wired/.test(src)) {
    fails.push(`${FILE}: still claims Filter by Debtor is not wired`);
  }
  return fails;
}

if (process.argv.includes("--selftest")) {
  const good = `
searchParams.get("pr_customer_ids")
p.set("pr_customer_ids", value)
dataTestId="factoring-purchase-report-debtor-filter"
kind="customer"
purchaseReportDebtorIds
ariaLabel="Filter by Debtor"
`;
  if (audit(good).length) throw new Error("SELFTEST FAIL clean: " + JSON.stringify(audit(good)));
  const bad = good.replace("purchaseReportDebtorIds", "x") + `\n"Filter by Debtor" are not wired this pass\n`;
  if (audit(bad).length === 0) throw new Error("SELFTEST FAIL: unwired note undetected");
  console.log(`${LABEL}: SELFTEST PASS`);
  process.exit(0);
}

const fails = audit(fs.readFileSync(path.join(ROOT, FILE), "utf8"));
if (fails.length) {
  console.error(`${LABEL} FAILED:`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — Purchase Report Filter by Debtor wired via EntityMultiSelect + pr_customer_ids`);
