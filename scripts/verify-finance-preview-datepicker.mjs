#!/usr/bin/env node
/**
 * verify-finance-preview-datepicker
 * LV-FINANCE-CALCULATOR-NATIVE-DATE-INPUT + LV-FINANCE-LOAN-WIZARD-NATIVE-DATE-INPUT —
 * first-payment fields must use shared DatePicker; forbid field(..., "date") dynamic
 * helper bypass that verify-no-raw-date-input misses (type={type}).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-finance-preview-datepicker";
const TARGETS = [
  "apps/frontend/src/pages/finance/CalculatorPage.tsx",
  "apps/frontend/src/pages/finance/LoanWizardPage.tsx",
];

function assertPage(src, file) {
  const errors = [];
  if (!src.includes("DatePicker")) {
    errors.push(`${file}: must import/use DatePicker`);
  }
  if (!/firstPaymentDate/.test(src) || !/DatePicker[\s\S]{0,200}firstPaymentDate|value=\{form\.firstPaymentDate\}/.test(src)) {
    errors.push(`${file}: firstPaymentDate must bind DatePicker value={form.firstPaymentDate}`);
  }
  // Dynamic helper bypass: field("…", "…", "date") or field(..., "date")
  if (/field\s*\([^)]*["']date["']\s*\)/.test(src)) {
    errors.push(`${file}: must not pass "date" into dynamic field(..., type) helper`);
  }
  return errors;
}

function selftest() {
  const bad = `
    const field = (label, key, type = "text") => <input type={type} />;
    {field("First payment", "firstPaymentDate", "date")}
  `;
  const good = `
    import { DatePicker } from "../../components/forms/DatePicker";
    <DatePicker value={form.firstPaymentDate} onChange={(next) => setForm((f) => ({ ...f, firstPaymentDate: next }))} />
  `;
  if (assertPage(bad, "BAD").length === 0) {
    console.error(`${LABEL} SELFTEST FAIL: expected BAD`);
    process.exit(1);
  }
  if (assertPage(good, "GOOD").length > 0) {
    console.error(`${LABEL} SELFTEST FAIL: expected GOOD`, assertPage(good, "GOOD"));
    process.exit(1);
  }
  console.log(`${LABEL} selftest PASS — detects field(..., "date"); accepts DatePicker`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = [];
for (const rel of TARGETS) {
  errors.push(...assertPage(fs.readFileSync(path.join(process.cwd(), rel), "utf8"), rel));
}
if (errors.length) {
  console.error(`${LABEL} FAIL:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — Calculator + Loan Wizard first-payment DatePicker`);
