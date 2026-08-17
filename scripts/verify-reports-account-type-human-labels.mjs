#!/usr/bin/env node
/**
 * verify-reports-account-type-human-labels.mjs
 * LV-REPORTS-ACCOUNT-TYPE-RAW-ENUM-LABELS
 *
 * Trial Balance / Profit & Loss / Cash Flow Statement must display
 * formatAccountTypeLabel(…) — never raw account_type enum tokens.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-reports-account-type-human-labels";
const LIB = "apps/frontend/src/lib/formatAccountTypeLabel.ts";
const CONSUMERS = [
  "apps/frontend/src/pages/reports/TrialBalancePage.tsx",
  "apps/frontend/src/pages/reports/ProfitLossPage.tsx",
  "apps/frontend/src/pages/reports/CashFlowStatementPage.tsx",
];

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function analyze() {
  const failures = [];
  const lib = read(LIB);
  if (!/export function formatAccountTypeLabel/.test(lib)) {
    failures.push("formatAccountTypeLabel.ts must export formatAccountTypeLabel");
  }
  if (!/humanizeEnumLabel/.test(lib)) {
    failures.push("formatAccountTypeLabel must reuse humanizeEnumLabel");
  }

  for (const rel of CONSUMERS) {
    const src = read(rel);
    if (!/formatAccountTypeLabel/.test(src)) {
      failures.push(`${rel} must import/use formatAccountTypeLabel`);
    }
    if (/\{(?:row|line)\.account_type\s*\|\|\s*"—"\}/.test(src)) {
      failures.push(`${rel} must not paint raw account_type with || "—" fallback`);
    }
    if (!/formatAccountTypeLabel\(\s*(?:row|line)\.account_type\s*\)/.test(src)) {
      failures.push(`${rel} must call formatAccountTypeLabel on account_type in the Type column`);
    }
  }
  return failures;
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const tbPath = path.join(process.cwd(), CONSUMERS[0]);
  const original = fs.readFileSync(tbPath, "utf8");
  try {
    const bad = original.replace(
      /\{formatAccountTypeLabel\(row\.account_type\)\}/,
      '{row.account_type || "—"}',
    );
    if (bad === original) fail("selftest could not plant raw TrialBalance account_type");
    fs.writeFileSync(tbPath, bad);
    const planted = analyze();
    if (!planted.some((m) => /TrialBalancePage|raw account_type/.test(m))) {
      fail(`selftest expected TrialBalance fail; got: ${planted.join("; ")}`);
    }
  } finally {
    fs.writeFileSync(tbPath, original);
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
console.log(
  `${LABEL} PASS — TrialBalance + ProfitLoss + CashFlowStatement use formatAccountTypeLabel`,
);
