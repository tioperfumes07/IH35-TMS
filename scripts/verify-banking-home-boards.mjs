#!/usr/bin/env node
/**
 * Pending row 38 — Banking › Home bare panels → BoardSection (fill-not-shell).
 * Honesty banners stay outside BoardSection.
 *
 *   node scripts/verify-banking-home-boards.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-banking-home-boards";
const FILE = "apps/frontend/src/pages/banking/BankingHome.tsx";
const src = fs.readFileSync(path.join(ROOT, FILE), "utf8");
const fails = [];

if (!src.includes('from "../../components/v3/BoardSection"')) {
  fails.push(`${FILE}: must import BoardSection`);
}
for (const testId of [
  "banking-home-accounts-board",
  "banking-home-factoring-virtual-board",
  "bank-account-inspect-board",
  "banking-home-relay-board",
  "banking-home-statement-import-board",
  "banking-home-plaid-board",
  "banking-home-settings-board",
]) {
  const re = new RegExp(`<BoardSection[\\s\\S]{0,260}testId=["']${testId}["']`);
  if (!re.test(src)) fails.push(`${FILE}: missing BoardSection testId=${testId}`);
}
for (const keep of [
  'data-testid="bank-account-inspect-panel"',
  'data-testid="banking-relay-tab"',
  "BankingHomeBoard",
  "reorderBankAccounts",
  "StatementUpload",
  "FORM_SELECT_CLASS",
]) {
  if (!src.includes(keep)) fails.push(`${FILE}: must keep ${keep}`);
}

if (fails.length) {
  console.error(`${LABEL}: FAIL\n  - ${fails.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — Banking Home tab panels use BoardSection`);
