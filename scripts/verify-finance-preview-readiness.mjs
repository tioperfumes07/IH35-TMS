#!/usr/bin/env node
/**
 * verify-finance-preview-readiness
 * CLS-FINANCE-PREVIEW-RAW-VALIDATION-ERROR — Calculator + Loan Wizard must gate
 * Calculate/Preview on leaf readiness and map validation_error to operator copy
 * (never surface the raw token as the only error).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-finance-preview-readiness";
const TARGETS = [
  "apps/frontend/src/pages/finance/CalculatorPage.tsx",
  "apps/frontend/src/pages/finance/LoanWizardPage.tsx",
];

function assertPage(src, file) {
  const errors = [];
  const ready = /calcReady|previewReady/.test(src);
  if (!ready) errors.push(`${file}: missing calcReady/previewReady predicate`);
  if (!/disabled=\{busy \|\| !(calcReady|previewReady)\}/.test(src)) {
    errors.push(`${file}: Calculate/Preview button must disable when !ready`);
  }
  if (!/validation_error/.test(src)) {
    errors.push(`${file}: must map validation_error to operator-facing copy`);
  }
  if (/setError\(m\?\.payload\?\.message \?\? m\?\.message/.test(src)) {
    errors.push(`${file}: must not pass raw ApiError.message (validation_error) straight to UI`);
  }
  if (!/if\s*\(\s*!(calcReady|previewReady)\s*\)/.test(src)) {
    errors.push(`${file}: handler must short-circuit when not ready`);
  }
  return errors;
}

function selftest() {
  const bad = `
    async function onCompute() { setBusy(true); ... }
    <button disabled={busy || !companyId}>Calculate</button>
    setError(m?.payload?.message ?? m?.message ?? "Calculation failed");
  `;
  const good = `
    const calcReady = !!companyId && toCents(form.price) > 0;
    async function onCompute() {
      if (!calcReady) { setError("..."); return; }
      ...
      if (code === "validation_error") return "Enter price...";
    }
    <button disabled={busy || !calcReady}>Calculate</button>
  `;
  const badErrs = assertPage(bad, "BAD");
  const goodErrs = assertPage(good, "GOOD");
  if (badErrs.length === 0) {
    console.error(`${LABEL} SELFTEST FAIL: expected BAD to fail`);
    process.exit(1);
  }
  if (goodErrs.length > 0) {
    console.error(`${LABEL} SELFTEST FAIL: expected GOOD to pass:`, goodErrs);
    process.exit(1);
  }
  console.log(`${LABEL} selftest PASS — detects ungated preview + raw validation_error`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = [];
for (const rel of TARGETS) {
  const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  errors.push(...assertPage(src, rel));
}
if (errors.length) {
  console.error(`${LABEL} FAIL:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — Calculator + Loan Wizard readiness + validation_error mapping`);
