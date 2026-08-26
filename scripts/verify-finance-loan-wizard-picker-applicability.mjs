#!/usr/bin/env node
/**
 * verify-finance-loan-wizard-picker-applicability.mjs
 * FINANCE-LOAN-WIZARD-PICKER-APPLICABILITY-THEATER
 *
 * nav.loan_wizard + finance.wizard.loan_wizard_page must NOT claim picker_law —
 * LoanWizardPage has no canonical-entity EntityPicker.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-finance-loan-wizard-picker-applicability";
const REQ = "docs/specs/scoreboard/modules/finance.required.json";
const WIZ = "apps/frontend/src/pages/finance/LoanWizardPage.tsx";
const LEAVES = ["nav.loan_wizard", "finance.wizard.loan_wizard_page"];

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function analyze() {
  const failures = [];
  const j = JSON.parse(read(REQ));
  for (const id of LEAVES) {
    const leaf = (j.leaves ?? []).find((l) => l.id === id);
    if (!leaf) {
      failures.push(`${id} missing from finance.required.json`);
      continue;
    }
    if ((leaf.required ?? []).includes("picker_law")) {
      failures.push(`${id} must not require picker_law (no canonical-entity field)`);
    }
    if (!(leaf.required ?? []).includes("connectivity")) {
      failures.push(`${id} must keep connectivity`);
    }
  }
  const block = (j.honesty_audit ?? {}).loan_wizard_picker_law_2026_08_17;
  if (!block) {
    failures.push("honesty_audit.loan_wizard_picker_law_2026_08_17 block missing");
  } else {
    for (const id of LEAVES) {
      const drop = (block.drops ?? []).find((d) => d.id === id);
      if (!drop || !(drop.removed ?? []).includes("picker_law")) {
        failures.push(`honesty drop must remove picker_law from ${id}`);
      }
    }
  }
  const wiz = read(WIZ);
  if (/EntityPicker|ReferenceSelect|allowCreate\s*=/.test(wiz)) {
    failures.push("LoanWizardPage must not mount EntityPicker/ReferenceSelect while picker_law is dropped");
  }
  if (!/MoneyInput|DatePicker|previewLoanWizard|Lender|VIN/.test(wiz)) {
    failures.push("LoanWizardPage must still expose money/date/preview/lender-or-VIN fields");
  }
  if (!/Lender \*/.test(wiz)) {
    failures.push("LoanWizardPage Lender * required mark (FINANCE-HUB-SILENT-DISABLED-BUTTON)");
  }
  if (!/title=\{!previewReady/.test(wiz)) {
    failures.push("LoanWizardPage Preview must title-explain why it is disabled");
  }
  return failures;
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const reqPath = path.join(process.cwd(), REQ);
  const original = fs.readFileSync(reqPath, "utf8");
  try {
    const j = JSON.parse(original);
    const leaf = (j.leaves ?? []).find((l) => l.id === "nav.loan_wizard");
    if (!leaf) fail("selftest: leaf missing");
    leaf.required = [...new Set([...(leaf.required ?? []), "picker_law"])];
    fs.writeFileSync(reqPath, JSON.stringify(j, null, 2) + "\n");
    const bad = analyze();
    if (!bad.some((m) => /nav\.loan_wizard must not require picker_law/.test(m))) {
      fail("selftest expected picker_law reclaim to fail");
    }
  } finally {
    fs.writeFileSync(reqPath, original);
  }
  const good = analyze();
  if (good.length) fail(`selftest expected GOOD after restore: ${good.join("; ")}`);
  console.log(`${LABEL} selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const failures = analyze();
  if (failures.length) {
    for (const f of failures) console.error(`${LABEL} FAIL: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — loan wizard owes connectivity only (no picker_law)`);
}

main();
