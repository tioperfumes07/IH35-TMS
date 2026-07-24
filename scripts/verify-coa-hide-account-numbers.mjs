#!/usr/bin/env node
/**
 * Owner 2026-07-23: QBO/CoA account numbers must not appear in picker labels by default.
 * Fail if coaAccountReferenceOption still prefixes number · name, or CoA list lacks hide toggle.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

const labels = fs.readFileSync(path.join(ROOT, "apps/frontend/src/components/parity/referenceOptionLabels.ts"), "utf8");
if (!labels.includes("formatAccountDisplayLabel")) {
  failures.push("coaAccountReferenceOption must use formatAccountDisplayLabel (name-first)");
}
if (/const label = number \? `\$\{number\} ·/.test(labels) || /label = number \? `\$\{number\} ·/.test(labels)) {
  failures.push("coaAccountReferenceOption must not build number · name labels inline");
}

const coa = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/lists/accounting/ChartOfAccountsListPage.tsx"), "utf8");
if (!coa.includes('data-testid="coa-show-account-numbers-toggle"')) {
  failures.push("Chart of Accounts must expose show-account-numbers toggle");
}
if (!coa.includes("visible: showAccountNumbers")) {
  failures.push("NUMBER column must be gated by showAccountNumbers (default off)");
}

const pref = fs.readFileSync(path.join(ROOT, "apps/frontend/src/lib/show-account-numbers.ts"), "utf8");
if (!pref.includes('ih35.showAccountNumbers') || !pref.includes("formatAccountDisplayLabel")) {
  failures.push("missing show-account-numbers preference helper");
}

if (failures.length) {
  console.error(failures.map((f) => `✗ ${f}`).join("\n"));
  process.exit(1);
}
console.log("verify-coa-hide-account-numbers — OK");
