#!/usr/bin/env node
/** Codex QA 11-02 — Accounting Hub receivables aging: U30 sortable headers + currency $. */
import fs from "node:fs";
const LABEL = "verify-accounting-hub-aging-u30";
const FILE = "apps/frontend/src/pages/accounting/AccountingHubPage.tsx";
const src = fs.readFileSync(FILE, "utf8");
const fails = [];
if (!/testId="accounting-hub-receivables-aging"/.test(src)) fails.push("aging BoardSection missing");
const agingBlock = (src.match(/testId="accounting-hub-receivables-aging"[\s\S]*?<\/BoardSection>/) || [""])[0];
if (!agingBlock) fails.push("could not isolate aging BoardSection");
else {
  if (/sortable:\s*false/.test(agingBlock)) fails.push("aging columns must not set sortable:false (U30)");
  if (!/sortable:\s*true/.test(agingBlock)) fails.push("aging columns must set sortable:true");
  if (/formatPlainAmount/.test(agingBlock)) fails.push("aging amounts must not use formatPlainAmount (no $)");
  if (!/formatUsdCents\(b\.amountCents\)/.test(agingBlock) || !/formatUsdCents\(agingBuckets\.totalAmt\)/.test(agingBlock)) {
    fails.push("aging Amount + Total must use formatUsdCents");
  }
}
if (/function formatPlainAmount/.test(src)) fails.push("formatPlainAmount helper must be removed from hub");
if (process.argv.includes("--selftest")) {
  if (fails.length) { console.error(LABEL, "SELFTEST FAIL", fails); process.exit(1); }
  const plant = src.replace(/sortable:\s*true/g, "sortable: false");
  if (!/sortable:\s*false/.test(plant)) { console.error(LABEL, "SELFTEST plant escaped"); process.exit(1); }
  console.log(LABEL, "selftest PASS");
  process.exit(0);
}
if (fails.length) { console.error(LABEL, "FAIL", fails); process.exit(1); }
console.log(LABEL, "PASS — aging U30 sortable + $ currency");
