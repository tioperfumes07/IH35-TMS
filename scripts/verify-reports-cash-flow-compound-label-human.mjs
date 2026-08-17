#!/usr/bin/env node
/**
 * verify-reports-cash-flow-compound-label-human.mjs
 * LV-REPORTS-CASH-FLOW-RAW-COMPOUND-LABELS
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-reports-cash-flow-compound-label-human";
const LIB = "apps/frontend/src/lib/formatCashFlowCompoundLabel.ts";
const PAGE = "apps/frontend/src/pages/reports/CashFlowStatementPage.tsx";

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function analyze() {
  const failures = [];
  const lib = read(LIB);
  if (!/formatAccountTypeLabel/.test(lib) || !/humanizeEnumLabel/.test(lib)) {
    failures.push("lib must reuse formatAccountTypeLabel + humanizeEnumLabel");
  }
  if (!/indexOf\(":"\)/.test(lib)) {
    failures.push("lib must split compound AccountType:suffix labels");
  }

  const page = read(PAGE);
  if (!/formatCashFlowCompoundLabel\(line\.label\)/.test(page)) {
    failures.push("CashFlowStatementPage Label cell must call formatCashFlowCompoundLabel(line.label)");
  }
  if (/\{line\.label \|\| "—"\}/.test(page)) {
    failures.push("Label cell must not paint raw line.label");
  }
  return failures;
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const pagePath = path.join(process.cwd(), PAGE);
  const original = fs.readFileSync(pagePath, "utf8");
  try {
    const bad = original.replace(
      /formatCashFlowCompoundLabel\(line\.label\)/,
      'line.label || "—"',
    );
    if (bad === original) fail("selftest could not plant raw line.label");
    fs.writeFileSync(pagePath, bad);
    const planted = analyze();
    if (!planted.some((m) => /formatCashFlowCompoundLabel|raw line\.label/.test(m))) {
      fail(`selftest expected page fail; got: ${planted.join("; ")}`);
    }
  } finally {
    fs.writeFileSync(pagePath, original);
  }
  const good = analyze();
  if (good.length) fail(`selftest expected GOOD: ${good.join("; ")}`);
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const failures = analyze();
if (failures.length) fail(failures.join("; "));
console.log(`${LABEL} PASS — Cash Flow Statement compound Labels are humanized`);
