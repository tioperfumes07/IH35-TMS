#!/usr/bin/env node
/**
 * LV-FINANCE-LOAN-WIZARD-NATIVE-DATE-INPUT (+ calculator sibling)
 * field() helpers must not accept type="date" — dates use shared DatePicker only.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  "apps/frontend/src/pages/finance/LoanWizardPage.tsx",
  "apps/frontend/src/pages/finance/CalculatorPage.tsx",
  "apps/frontend/src/pages/finance/AmortizationPage.tsx",
].map((f) => path.join(ROOT, f));

function fail(msg) {
  console.error(`FAIL verify-finance-loan-wizard-no-native-date-type: ${msg}`);
  process.exit(1);
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function assertFile(label, src) {
  const code = stripComments(src);
  if (/<input[^>]*\stype=["']date["']/.test(code) || /type=["']date["'][^>]*\s/.test(code)) {
    // Only fail on actual input tags with type=date
    if (/<input[\s\S]{0,120}?type=["']date["']/.test(code)) {
      fail(`${label}: raw <input type="date"> present`);
    }
  }
  // Dynamic helper must narrow to text|number (not open string that can be "date")
  if (/const field = \([^)]*type = "text"/.test(code) && !/type:\s*"text"\s*\|\s*"number"/.test(code)) {
    fail(`${label}: field() still uses open type = "text" (can pass date)`);
  }
}

function main() {
  for (const file of FILES) {
    if (!fs.existsSync(file)) continue;
    assertFile(path.basename(file), fs.readFileSync(file, "utf8"));
  }
  console.log("OK verify-finance-loan-wizard-no-native-date-type — text|number field helpers + DatePicker");
}

function selftest() {
  const bad = `const field = (label, key, type = "text") => (\n<input type={type} />\n)`;
  let failed = false;
  const orig = process.exit;
  process.exit = (c) => {
    failed = c === 1;
    throw new Error("exit");
  };
  try {
    assertFile("selftest-bad", bad);
  } catch {
    /* expected */
  }
  process.exit = orig;
  if (!failed) fail("selftest: open type default did not fail");
  console.log("OK verify-finance-loan-wizard-no-native-date-type --selftest");
}

if (process.argv.includes("--selftest")) selftest();
else main();
